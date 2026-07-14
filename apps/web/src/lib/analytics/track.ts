import type { AnalyticsProperties } from "./events";

let initialized = false;

function getRybbit() {
	if (typeof window === "undefined") {
		return null;
	}
	return window.rybbit ?? null;
}

export function markRybbitInitialized() {
	initialized = true;
}

function canTrack() {
	return initialized && getRybbit() !== null;
}

export function track(eventName: string, properties?: AnalyticsProperties) {
	if (!canTrack()) {
		return;
	}
	getRybbit()?.event(eventName, properties);
}

export function identifyUser(
	userId: string,
	traits?: Record<string, string | number | boolean>
) {
	if (!canTrack()) {
		return;
	}
	getRybbit()?.identify(userId, traits);
}

export function setUserTraits(
	traits: Record<string, string | number | boolean>
) {
	if (!canTrack()) {
		return;
	}
	getRybbit()?.setTraits(traits);
}

export function clearUser() {
	if (!canTrack()) {
		return;
	}
	getRybbit()?.clearUserId();
}

export function trackError(error: unknown, context?: AnalyticsProperties) {
	if (!canTrack()) {
		return;
	}
	const normalized =
		error instanceof Error
			? error
			: new Error(typeof error === "string" ? error : "Unknown error");
	getRybbit()?.error(normalized, context);
}

export function getErrorCode(error: unknown): string {
	if (error instanceof Error) {
		if (
			error.message.includes("CONFLICT") ||
			error.message.includes("changed")
		) {
			return "conflict";
		}
		if (error.message.includes("Not enough")) {
			return "insufficient_funds";
		}
		if (error.message.includes("locked")) {
			return "locked";
		}
		if (error.message.includes("Prestige")) {
			return "prestige_not_ready";
		}
		return "unknown";
	}
	return "unknown";
}
