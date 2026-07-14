# Updating the production app

This guide is for routine updates after the initial deployment in [deploy.md](./deploy.md).

Assumptions:

- You SSH in as `root`
- The app lives at `/opt/valkoinenmonsterv2`
- Environment files are in `/etc/valkoinenmonsterv2/`
- Services are `valkoinenmonsterv2-api` and `valkoinenmonsterv2-web`

## Standard update

Run this on the VPS after pushing changes to the remote branch:

```sh
cd /opt/valkoinenmonsterv2
git pull --ff-only
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

systemctl restart valkoinenmonsterv2-api valkoinenmonsterv2-web
```

## Verify

```sh
systemctl status valkoinenmonsterv2-api valkoinenmonsterv2-web
curl http://127.0.0.1:6283/
curl -I http://127.0.0.1:39281/
curl -I https://valkoinen.monster/
curl -s https://valkoinen.monster/ | grep -oE '/assets/[^"]+\.css' | head -1 | xargs -I{} curl -I "https://valkoinen.monster{}"

journalctl -u valkoinenmonsterv2-api -u valkoinenmonsterv2-web -n 50 --no-pager
```

Expected results:

- API returns `OK`
- Web returns `200`
- CSS/JS under `/assets/` return `200` (not `404`)
- Both systemd services are `active`

## What to rebuild

| Change | Rebuild web | Rebuild API | Run migrations | Restart |
| --- | --- | --- | --- | --- |
| Web UI / frontend code | yes | no | no | web |
| API / auth / tRPC / server code | no | yes | maybe | api (+ web if shared types affect SSR) |
| Database schema | no | yes | yes | api |
| Dependencies (`package.json`, lockfile) | yes | yes | maybe | both |
| `VITE_SERVER_URL` in `web.env` | yes | no | no | web |
| API env only (`api.env`) | no | no | no | api |

When in doubt, run the full standard update.

## Environment changes

Edit the env files on the VPS:

```sh
${EDITOR:-nano} /etc/valkoinenmonsterv2/api.env
${EDITOR:-nano} /etc/valkoinenmonsterv2/web.env
```

Then:

- **API env** (`api.env`): restart the API service
- **Web env** (`web.env`): rebuild the web app if `VITE_SERVER_URL` changed, then restart the web service

```sh
systemctl restart valkoinenmonsterv2-api
systemctl restart valkoinenmonsterv2-web
```

## Systemd or Caddy changes

Only needed when deployment config itself changes (ports, domains, service commands).

After editing unit files:

```sh
systemctl daemon-reload
systemctl restart valkoinenmonsterv2-api valkoinenmonsterv2-web
```

After editing `/etc/caddy/Caddyfile`:

```sh
caddy fmt --overwrite /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl reload caddy
```

See [deploy.md](./deploy.md) for the current service and Caddy configuration.

## Troubleshooting

**502 from Caddy**

Check that both services are running and listening:

```sh
systemctl status valkoinenmonsterv2-api valkoinenmonsterv2-web
ss -tlnp | grep -E '6283|39281'
journalctl -u valkoinenmonsterv2-api -u valkoinenmonsterv2-web -n 100 --no-pager
```

**Unstyled page (HTML only, no CSS)**

Static assets are not being served. Confirm the web service uses `srvx` with
`dist/client` and that `/assets/*` returns `200`:

```sh
curl -s https://valkoinen.monster/ | grep -oE '/assets/[^"]+\.css' | head -1 | xargs -I{} curl -I "https://valkoinen.monster{}"
```

**Service fails with `CHDIR` / `No such file or directory`**

The systemd `WorkingDirectory` must point to `/opt/valkoinenmonsterv2/apps/...`,
not `/opt/valkoinenmonsterv2/current/...`.

**Database migration failed**

Check `DATABASE_URL` in `/etc/valkoinenmonsterv2/api.env`, then rerun:

```sh
set -a
. /etc/valkoinenmonsterv2/api.env
set +a
cd /opt/valkoinenmonsterv2
/root/.bun/bin/bun run db:migrate
```
