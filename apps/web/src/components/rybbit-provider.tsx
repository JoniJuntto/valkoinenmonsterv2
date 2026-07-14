import rybbit from "@rybbit/js";
import { useEffect } from "react";

import {
	markRybbitCleanedUp,
	markRybbitInitialized,
} from "@/lib/analytics/track";

const RYBBIT_SITE_ID = "766a22932609";

export function RybbitProvider() {
	useEffect(() => {
		let cancelled = false;

		rybbit
			.init({
				analyticsHost: "https://app.rybbit.io/api",
				debounceDuration: 300,
				debug: import.meta.env.DEV,
				replayPrivacyConfig: {
					maskAllInputs: true,
					maskTextSelectors: [".rr-mask"],
				},
				siteId: RYBBIT_SITE_ID,
			})
			.then(() => {
				if (!cancelled) {
					markRybbitInitialized();
				}
			})
			.catch(() => undefined);

		return () => {
			cancelled = true;
			markRybbitCleanedUp();
			rybbit.cleanup();
		};
	}, []);

	return null;
}
