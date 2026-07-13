import type { ConnectionOptions } from "node:tls";
import type { PoolConfig } from "pg";

const SSL_QUERY_PARAMS = [
	"sslmode",
	"sslrootcert",
	"sslcert",
	"sslkey",
	"sslnegotiation",
	"uselibpqcompat",
] as const;

function getSslOptions(sslMode: string | null): ConnectionOptions | undefined {
	if (!sslMode || sslMode === "disable") {
		return;
	}

	const ca = process.env.DATABASE_CA_CERT;
	if (ca) {
		return { ca, rejectUnauthorized: true };
	}

	// UpCloud uses a private CA that Node.js does not trust by default.
	// Set DATABASE_CA_CERT to the UpCloud CA PEM for full certificate verification.
	return { rejectUnauthorized: false };
}

function stripSslQueryParams(databaseUrl: string): {
	connectionString: string;
	sslMode: string | null;
} {
	const url = new URL(databaseUrl);
	const sslMode = url.searchParams.get("sslmode");

	for (const param of SSL_QUERY_PARAMS) {
		url.searchParams.delete(param);
	}

	return {
		connectionString: url.toString(),
		sslMode,
	};
}

export function getPgPoolConfig(databaseUrl: string): PoolConfig {
	const { connectionString, sslMode } = stripSslQueryParams(databaseUrl);
	const ssl = getSslOptions(sslMode);

	return ssl ? { connectionString, ssl } : { connectionString };
}

export function getDrizzleDbCredentials(databaseUrl: string) {
	const url = new URL(databaseUrl);
	const sslMode = url.searchParams.get("sslmode");
	const ssl = getSslOptions(sslMode);

	const credentials = {
		database: url.pathname.slice(1),
		host: url.hostname,
		password: decodeURIComponent(url.password),
		port: url.port ? Number(url.port) : 5432,
		user: decodeURIComponent(url.username),
		...(ssl ? { ssl } : {}),
	};

	return credentials;
}
