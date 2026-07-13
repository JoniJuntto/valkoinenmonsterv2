 # Deploy to an UpCloud VPS

This guide assumes you SSH in as `root` and run everything directly with no
extra service user.

This deployment uses:

- `valkoinen.monster` as the canonical domain
- `valkonen.monster` as a permanent redirect to the canonical domain
- the VPS-wide `/etc/caddy/Caddyfile`
- `127.0.0.1:39281` for the web app
- `127.0.0.1:39282` for the API

The unusual ports stay private. Only SSH, HTTP, and HTTPS should be exposed by
the UpCloud and host firewalls.

## 1. Prepare UpCloud and DNS

Create or reuse an Ubuntu LTS server with a public IPv4 address and an SSH key.
Allow inbound TCP ports `22`, `80`, and `443`. Do not open `39281` or `39282`.

Create these DNS records at the domain provider:

| Type | Name | Value |
| --- | --- | --- |
| `A` | `valkoinen.monster` | VPS public IPv4 |
| `A` | `valkonen.monster` | VPS public IPv4 |

Add matching `AAAA` records only if the VPS has working public IPv6.

On the VPS, enable the same rules in UFW if it is used:

```sh
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

## 2. Install Bun and clone the application

```sh
apt update
apt install -y curl git unzip
curl -fsSL https://bun.com/install | bash

mkdir -p /opt/valkoinenmonsterv2
git clone <REPOSITORY_URL> /opt/valkoinenmonsterv2/current
cd /opt/valkoinenmonsterv2/current && /root/.bun/bin/bun ci
```

## 3. Make the API port configurable once

The API currently hardcodes port `3000`. Before deploying, change its Elysia
initialization and listener in `apps/server/src/index.ts` to use the service
environment:

```ts
new Elysia({
	serve: { hostname: process.env.HOST ?? "127.0.0.1" },
})
	// existing routes and middleware
	.listen(process.env.PORT ?? 6283, () => {
		console.log(`Server is running on ${process.env.HOST ?? "127.0.0.1"}:${process.env.PORT ?? 6283}`);
	});
```

Commit that source change so future deployments do not need a VPS-only patch.

## 4. Configure production environment variables

```sh
install -d -m 700 /etc/valkoinenmonsterv2
touch /etc/valkoinenmonsterv2/api.env /etc/valkoinenmonsterv2/web.env
chmod 600 /etc/valkoinenmonsterv2/api.env /etc/valkoinenmonsterv2/web.env
```

Why Put this in `/etc/valkoinenmonsterv2/api.env`:

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=39282
DATABASE_URL="postgres://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=verify-full"
BETTER_AUTH_SECRET="REPLACE_WITH_OPENSSL_RAND_HEX_32_OUTPUT"
BETTER_AUTH_URL="https://valkoinen.monster"
CORS_ORIGIN="https://valkoinen.monster"
```

Generate the secret with `openssl rand -hex 32`.

Put this in `/etc/valkoinenmonsterv2/web.env`:

```dotenv
HOST=127.0.0.1
PORT=39281
VITE_SERVER_URL="https://valkoinen.monster"
```

`VITE_SERVER_URL` is a build-time value, so the web app must be rebuilt when it
changes.

## 5. Build and migrate

```sh
cd /opt/valkoinenmonsterv2/current
/root/.bun/bin/bun ci

set -a
. /etc/valkoinenmonsterv2/web.env
set +a
/root/.bun/bin/bun run --cwd apps/web build

set -a
. /etc/valkoinenmonsterv2/api.env
set +a
/root/.bun/bin/bun run --cwd apps/server build
/root/.bun/bin/bun run db:migrate
```

## 6. Add systemd services

Create `/etc/systemd/system/valkoinenmonsterv2-api.service`:

```ini
[Unit]
Description=Valkoinen Monster API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/valkoinenmonsterv2/current/apps/server
EnvironmentFile=/etc/valkoinenmonsterv2/api.env
ExecStart=/root/.bun/bin/bun run dist/index.mjs
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Create `/etc/systemd/system/valkoinenmonsterv2-web.service`:

```ini
[Unit]
Description=Valkoinen Monster web
After=network-online.target valkoinenmonsterv2-api.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/valkoinenmonsterv2/current/apps/web
EnvironmentFile=/etc/valkoinenmonsterv2/web.env
ExecStart=/root/.bun/bin/bun run dist/server/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable and start both services:

```sh
systemctl daemon-reload
systemctl enable --now valkoinenmonsterv2-api valkoinenmonsterv2-web
systemctl status valkoinenmonsterv2-api valkoinenmonsterv2-web
```

## 7. Append to the shared VPS Caddyfile

Do not replace the existing Caddyfile because it contains other services.
Back it up, then append these site blocks to `/etc/caddy/Caddyfile`:

```sh
cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.backup
${EDITOR:-nano} /etc/caddy/Caddyfile
```

```caddyfile
valkonen.monster {
	redir https://valkoinen.monster{uri} permanent
}

valkoinen.monster {
	encode zstd gzip

	@api path /api/auth /api/auth/* /trpc /trpc/*
	handle @api {
		reverse_proxy 127.0.0.1:39282
	}

	handle {
		reverse_proxy 127.0.0.1:39281
	}
}
```

Validate before reloading the shared Caddy service:

```sh
caddy fmt --overwrite /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl reload caddy
```

Caddy obtains and renews HTTPS certificates automatically after both DNS names
resolve to the VPS and ports `80` and `443` are reachable.

## 8. Verify

```sh
curl http://127.0.0.1:39282/
curl -I http://127.0.0.1:39281/
curl -I https://valkoinen.monster
curl -I https://valkonen.monster

journalctl -u valkoinenmonsterv2-api -u valkoinenmonsterv2-web -n 100 --no-pager
journalctl -u caddy -n 100 --no-pager
```

The API check should return `OK`, the canonical domain should return the web
application, and `valkonen.monster` should redirect to `valkoinen.monster`.

## Updating later

```sh
cd /opt/valkoinenmonsterv2/current
git pull --ff-only
/root/.bun/bin/bun ci
```

Repeat the build and migration commands from step 5, then restart the services:

```sh
systemctl restart valkoinenmonsterv2-api valkoinenmonsterv2-web
```
