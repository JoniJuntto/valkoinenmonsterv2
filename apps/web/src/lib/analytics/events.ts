export type AnalyticsPropertyValue = string | number | boolean;

export type AnalyticsProperties = Record<string, AnalyticsPropertyValue>;

export const AnalyticsEvents = {
	auth: {
		anonymousFailed: "auth.anonymous.failed",
		anonymousSucceeded: "auth.anonymous.succeeded",
		formSwitched: "auth.form.switched",
		formViewed: "auth.form.viewed",
		signInFailed: "auth.sign_in.failed",
		signInSubmitted: "auth.sign_in.submitted",
		signInSucceeded: "auth.sign_in.succeeded",
		signOut: "auth.sign_out",
		signUpFailed: "auth.sign_up.failed",
		signUpSubmitted: "auth.sign_up.submitted",
		signUpSucceeded: "auth.sign_up.succeeded",
	},
	game: {
		clickMilestone: "game.click.milestone",
		error: "game.error",
		frenzyEnded: "game.frenzy.ended",
		frenzyStarted: "game.frenzy.started",
		loaded: "game.loaded",
		offlineReturn: "game.offline.return",
		prestigeCancelled: "game.prestige.cancelled",
		prestigeConfirmed: "game.prestige.confirmed",
		prestigeReady: "game.prestige.ready",
		purchaseGoldenUpgrade: "game.purchase.golden_upgrade",
		purchaseProducer: "game.purchase.producer",
		purchaseProducerAuto: "game.purchase.producer_auto",
		purchaseRunUpgrade: "game.purchase.run_upgrade",
	},
	nav: {
		claimProgress: "nav.claim_progress",
		logoClicked: "nav.logo_clicked",
	},
	ui: {
		audioToggled: "ui.audio_toggled",
		leaderboardViewed: "ui.leaderboard_viewed",
		themeChanged: "ui.theme_changed",
	},
} as const;
