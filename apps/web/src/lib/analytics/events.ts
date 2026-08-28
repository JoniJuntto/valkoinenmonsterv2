export type AnalyticsPropertyValue = string | number | boolean;

export type AnalyticsProperties = Record<string, AnalyticsPropertyValue>;

export const AnalyticsEvents = {
	auth: {
		anonymousFailed: "auth.anonymous.failed",
		anonymousSucceeded: "auth.anonymous.succeeded",
		formSwitched: "auth.form.switched",
		formViewed: "auth.form.viewed",
		passwordResetCompleted: "auth.password_reset.completed",
		passwordResetRequested: "auth.password_reset.requested",
		signInFailed: "auth.sign_in.failed",
		signInSubmitted: "auth.sign_in.submitted",
		signInSucceeded: "auth.sign_in.succeeded",
		signOut: "auth.sign_out",
		signUpFailed: "auth.sign_up.failed",
		signUpSubmitted: "auth.sign_up.submitted",
		signUpSucceeded: "auth.sign_up.succeeded",
	},
	game: {
		achievementUnlocked: "game.achievement.unlocked",
		clickMilestone: "game.click.milestone",
		codexSetCompleted: "game.codex.set_completed",
		codexVariantUnlocked: "game.codex.variant_unlocked",
		draftPicked: "game.draft.picked",
		error: "game.error",
		frenzyEnded: "game.frenzy.ended",
		frenzyStarted: "game.frenzy.started",
		goldenRushClaimed: "game.golden_rush.claimed",
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
	season: {
		bannerClicked: "game.season.banner_clicked",
		purchaseProducer: "game.season.purchase.producer",
		purchaseUpgrade: "game.season.purchase.upgrade",
		tap: "game.season.tap",
		viewed: "game.season.viewed",
	},
	ui: {
		audioToggled: "ui.audio_toggled",
		buyQuantityChanged: "ui.buy_quantity_changed",
		leaderboardViewed: "ui.leaderboard_viewed",
		smartStockerToggled: "ui.smart_stocker_toggled",
		themeChanged: "ui.theme_changed",
	},
} as const;
