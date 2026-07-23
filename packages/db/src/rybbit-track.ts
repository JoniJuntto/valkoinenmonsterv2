import { env } from "@valkoinenmonsterv2/env/server";

const RYBBIT_TRACK_URL = "https://analytics.huikaton.online/api/track";

export type ServerEventProperties = Record<string, string | number | boolean>;

export function bucketCans(value: number): string {
	if (value < 100) {
		return "0-99";
	}
	if (value < 1000) {
		return "100-999";
	}
	if (value < 10_000) {
		return "1k-9k";
	}
	if (value < 100_000) {
		return "10k-99k";
	}
	if (value < 1_000_000) {
		return "100k-999k";
	}
	if (value < 10_000_000) {
		return "1m-9m";
	}
	return "10m+";
}

export async function trackServerEvent(
	eventName: string,
	properties: ServerEventProperties,
	userId?: string
): Promise<void> {
	if (!env.RYBBIT_API_KEY) {
		return;
	}

	try {
		await fetch(RYBBIT_TRACK_URL, {
			body: JSON.stringify({
				event_name: eventName,
				properties: JSON.stringify(properties),
				site_id: env.RYBBIT_SITE_ID,
				type: "custom_event",
				...(userId ? { user_id: userId } : {}),
			}),
			headers: {
				Authorization: `Bearer ${env.RYBBIT_API_KEY}`,
				"Content-Type": "application/json",
			},
			method: "POST",
		});
	} catch {
		// Analytics must not break app flows.
	}
}
