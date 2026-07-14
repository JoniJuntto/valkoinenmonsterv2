import { useEffect } from "react";

import { markRybbitInitialized } from "@/lib/analytics/track";

const RYBBIT_READY_TIMEOUT_MS = 10_000;

function waitForRybbit(): Promise<void> {
	if (typeof window === "undefined") {
		return Promise.resolve();
	}
	if (window.rybbit) {
		return Promise.resolve();
	}

	return new Promise((resolve, reject) => {
		const startedAt = Date.now();
		const interval = window.setInterval(() => {
			if (window.rybbit) {
				window.clearInterval(interval);
				resolve();
				return;
			}
			if (Date.now() - startedAt >= RYBBIT_READY_TIMEOUT_MS) {
				window.clearInterval(interval);
				reject(new Error("Rybbit script did not load"));
			}
		}, 50);
	});
}

export function RybbitProvider() {
	useEffect(() => {
		waitForRybbit()
			.then(() => {
				markRybbitInitialized();
			})
			.catch(() => undefined);
	}, []);

	return null;
}
