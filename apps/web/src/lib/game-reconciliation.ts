import {
	activeFrenzyMultiplier,
	calculateClickValue,
	calculateIdleGain,
	clampGameValue,
	clickBuffMultiplier,
	frenzyDurationMs,
	type GameSnapshot,
	GOLDEN_RUSH_VISIBLE_MS,
	MAX_FRENZY_STACKS,
	OFFLINE_ACCRUAL_THRESHOLD_MS,
	offlineProductionMultiplier,
	PRODUCTION_FRENZY_MULTIPLIER,
} from "@valkoinenmonsterv2/api/game";

export interface PendingClickBatch {
	queuedDuringRequest: number;
	sent: number;
}

export const projectElapsed = (
	snapshot: GameSnapshot,
	now: number
): GameSnapshot => {
	const elapsedMs = Math.max(0, now - snapshot.lastAccruedAt);
	if (elapsedMs === 0) {
		return snapshot;
	}
	const frenzyEnd = snapshot.frenzyEndsAt ?? 0;
	const frenzyMs = Math.max(
		0,
		Math.min(now, frenzyEnd) - snapshot.lastAccruedAt
	);
	const buffEnd =
		snapshot.goldenRushBuffKind === "production_frenzy"
			? (snapshot.goldenRushBuffEndsAt ?? 0)
			: 0;
	const buffMs = Math.max(0, Math.min(now, buffEnd) - snapshot.lastAccruedAt);
	const gain = calculateIdleGain(
		snapshot,
		elapsedMs,
		frenzyMs,
		elapsedMs >= OFFLINE_ACCRUAL_THRESHOLD_MS
			? offlineProductionMultiplier(snapshot)
			: 1,
		buffMs,
		PRODUCTION_FRENZY_MULTIPLIER
	);
	return {
		...snapshot,
		bestRunCans: clampGameValue(
			Math.max(snapshot.bestRunCans, snapshot.runCans + gain)
		),
		cans: clampGameValue(snapshot.cans + gain),
		lastAccruedAt: now,
		lifetimeCans: clampGameValue(snapshot.lifetimeCans + gain),
		runCans: clampGameValue(snapshot.runCans + gain),
		serverNow: now,
	};
};

export const projectPendingClicks = (
	snapshot: GameSnapshot,
	now: number,
	pendingClicks: number
): GameSnapshot => {
	let projected = projectElapsed(snapshot, now);
	if (pendingClicks === 0) {
		return projected;
	}
	const isFrenzyActive = (projected.frenzyEndsAt ?? 0) > now;
	const gain =
		pendingClicks *
		calculateClickValue(projected) *
		(isFrenzyActive
			? activeFrenzyMultiplier(projected, projected.frenzyStacks)
			: 1) *
		clickBuffMultiplier(projected, now);
	const canStackFrenzy =
		isFrenzyActive &&
		projected.ascensionNodes["frenzy-stacking"] > 0 &&
		projected.frenzyStacks < MAX_FRENZY_STACKS;
	let { frenzyEndsAt, nextFrenzyClick, frenzyStacks } = projected;
	if (pendingClicks >= nextFrenzyClick) {
		if (isFrenzyActive) {
			if (canStackFrenzy) {
				frenzyEndsAt =
					(projected.frenzyEndsAt ?? now) + frenzyDurationMs(projected);
				frenzyStacks = projected.frenzyStacks + 1;
				nextFrenzyClick = 0;
			}
		} else {
			nextFrenzyClick = 0;
			frenzyEndsAt = now + frenzyDurationMs(projected);
			frenzyStacks = 1;
		}
	} else if (!isFrenzyActive || canStackFrenzy) {
		nextFrenzyClick -= pendingClicks;
	}
	projected = {
		...projected,
		bestRunCans: clampGameValue(
			Math.max(projected.bestRunCans, projected.runCans + gain)
		),
		cans: clampGameValue(projected.cans + gain),
		frenzyEndsAt,
		frenzyStacks,
		lifetimeCans: clampGameValue(projected.lifetimeCans + gain),
		nextFrenzyClick: Math.max(0, nextFrenzyClick),
		runCans: clampGameValue(projected.runCans + gain),
	};
	return projected;
};

export const reconcileMutationSuccess = (
	canonicalSnapshot: GameSnapshot,
	now: number,
	batch: PendingClickBatch
): GameSnapshot =>
	projectPendingClicks(canonicalSnapshot, now, batch.queuedDuringRequest);

export const reconcileMutationFailure = (
	refreshedSnapshot: GameSnapshot,
	now: number,
	batch: PendingClickBatch
): { pendingClicks: number; projected: GameSnapshot } => {
	const pendingClicks = batch.sent + batch.queuedDuringRequest;
	return {
		pendingClicks,
		projected: projectPendingClicks(refreshedSnapshot, now, pendingClicks),
	};
};

export const isGoldenRushVisible = (snapshot: GameSnapshot): boolean => {
	const readyAt = snapshot.goldenRushReadyAt;
	return (
		readyAt !== null &&
		snapshot.serverNow >= readyAt &&
		snapshot.serverNow <= readyAt + GOLDEN_RUSH_VISIBLE_MS
	);
};
