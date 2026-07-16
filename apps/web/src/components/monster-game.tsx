import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	calculateClickValue,
	calculateCps,
	cheapestAffordableProducer,
	clampGameValue,
	FRENZY_DURATION_MS,
	FRENZY_MULTIPLIER,
	formatGameNumber,
	type GameSnapshot,
	GOLDEN_UPGRADES,
	goldenUpgradeCost,
	isGoldenUpgradeId,
	OFFLINE_PRODUCTION_MULTIPLIER,
	PRODUCERS,
	type ProducerId,
	prestigeRequirement,
	prestigeReward,
	producerCost,
	RUN_UPGRADES,
} from "@valkoinenmonsterv2/api/game";
import { Button } from "@valkoinenmonsterv2/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@valkoinenmonsterv2/ui/components/card";
import { Skeleton } from "@valkoinenmonsterv2/ui/components/skeleton";
import { cn } from "@valkoinenmonsterv2/ui/lib/utils";
import { Volume2Icon, VolumeXIcon } from "lucide-react";
import {
	type MouseEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import {
	bucketCans,
	bucketCps,
	bucketElapsedMs,
} from "@/lib/analytics/buckets";
import { AnalyticsEvents } from "@/lib/analytics/events";
import { getClickMilestone } from "@/lib/analytics/milestones";
import {
	getErrorCode,
	setUserTraits,
	track,
	trackError,
} from "@/lib/analytics/track";
import { authClient } from "@/lib/auth-client";
import { useTRPC } from "@/utils/trpc";

const HEARTBEAT_MS = 5000;
const DISPLAY_TICK_MS = 100;
const CAN_AUDIO_POOL_SIZE = 6;
const PARTICLES = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"];

const formatElapsedTime = (elapsedMs: number): string => {
	const totalSeconds = Math.floor(elapsedMs / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	if (hours > 0) {
		return `${hours}h ${minutes}m`;
	}
	return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
};

interface MutationBase {
	operationId: string;
	pendingManualClicks: number;
	revision: number;
}

type MutationAction = (input: MutationBase) => Promise<GameSnapshot>;

type MutationActionName =
	| "sync"
	| "buy_producer"
	| "buy_upgrade"
	| "trigger_frenzy"
	| "prestige";

interface MutationOptions {
	action: MutationActionName;
	producerId?: ProducerId;
	producerSource?: "manual" | "smart_stocker";
	silent?: boolean;
	upgradeId?: string;
}

interface ClickLabel {
	amount: number;
	id: number;
	left: number;
}

const projectElapsed = (snapshot: GameSnapshot, now: number): GameSnapshot => {
	const elapsedMs = Math.max(0, now - snapshot.lastAccruedAt);
	if (elapsedMs === 0) {
		return snapshot;
	}
	const frenzyEnd = snapshot.frenzyEndsAt ?? 0;
	const frenzyMs = Math.max(
		0,
		Math.min(now, frenzyEnd) - snapshot.lastAccruedAt
	);
	const normalMs = Math.max(0, elapsedMs - frenzyMs);
	const gain =
		calculateCps(snapshot) * ((normalMs + frenzyMs * FRENZY_MULTIPLIER) / 1000);
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

const projectPendingClicks = (
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
		(isFrenzyActive ? FRENZY_MULTIPLIER : 1);
	let { frenzyEndsAt, nextFrenzyClick } = projected;
	if (!isFrenzyActive && pendingClicks >= nextFrenzyClick) {
		nextFrenzyClick = 0;
		frenzyEndsAt = now + FRENZY_DURATION_MS;
	} else if (!isFrenzyActive) {
		nextFrenzyClick -= pendingClicks;
	}
	projected = {
		...projected,
		bestRunCans: clampGameValue(
			Math.max(projected.bestRunCans, projected.runCans + gain)
		),
		cans: clampGameValue(projected.cans + gain),
		frenzyEndsAt,
		lifetimeCans: clampGameValue(projected.lifetimeCans + gain),
		nextFrenzyClick,
		runCans: clampGameValue(projected.runCans + gain),
	};
	return projected;
};

const GameLoading = () => (
	<main className="grid gap-4 px-4 pb-8 md:grid-cols-3">
		{["stats", "can", "shop"].map((name) => (
			<Card key={name}>
				<CardHeader>
					<Skeleton className="h-5 w-32" />
					<Skeleton className="h-3 w-48" />
				</CardHeader>
				<CardContent>
					<Skeleton className="h-64 w-full" />
				</CardContent>
			</Card>
		))}
	</main>
);

interface StatsCardProps {
	clicksPerSecond: number;
	game: GameSnapshot;
	isSaving: boolean;
	onPrestige: () => void;
}

const NUTRITION_ROWS: {
	label: string;
	value: (game: GameSnapshot) => string;
}[] = [
	{
		label: "Lifetime cans",
		value: (game) => formatGameNumber(game.lifetimeCans),
	},
	{ label: "Best run", value: (game) => formatGameNumber(game.bestRunCans) },
	{ label: "Prestige level", value: (game) => String(game.prestigeLevel) },
	{ label: "Golden cans", value: (game) => String(game.goldenCans) },
];

const StatsCard = ({
	clicksPerSecond,
	game,
	isSaving,
	onPrestige,
}: StatsCardProps) => {
	const requirement = prestigeRequirement(game.totalGoldenCans);
	const reward = prestigeReward(game.runCans, game.totalGoldenCans);
	return (
		<Card className="order-2 gap-0 self-start py-0 ring-foreground xl:col-start-1 xl:row-start-1">
			<div className="p-(--card-spacing) pb-3">
				<h2 className="font-display text-3xl uppercase leading-none tracking-wide">
					Ravintosisältö
				</h2>
				<p className="text-muted-foreground">Nutrition facts · 0,5 l can</p>
				<div className="mt-2 border-foreground border-t-8" />
				<p className="border-foreground/20 border-b py-1 text-muted-foreground uppercase tracking-wider">
					Amount per serving
				</p>
				<dl>
					<div className="flex items-baseline justify-between gap-2 border-foreground/20 border-b py-1.5">
						<dt className="font-bold">Per click</dt>
						<dd className="font-bold tabular-nums">
							{formatGameNumber(calculateClickValue(game))}
						</dd>
					</div>
					<div className="flex items-baseline justify-between gap-2 border-foreground/20 border-b py-1.5">
						<dt className="font-bold">Click CPS</dt>
						<dd className="font-bold tabular-nums">
							{formatGameNumber(clicksPerSecond * calculateClickValue(game))}
						</dd>
					</div>
					<div className="flex items-baseline justify-between gap-2 border-foreground border-b-4 py-1.5">
						<dt className="font-bold">Per second</dt>
						<dd className="font-bold tabular-nums">
							{formatGameNumber(calculateCps(game))}
						</dd>
					</div>
					{NUTRITION_ROWS.map((row) => (
						<div
							className="flex items-baseline justify-between gap-2 border-foreground/20 border-b py-1.5"
							key={row.label}
						>
							<dt>{row.label}</dt>
							<dd className="tabular-nums">{row.value(game)}</dd>
						</div>
					))}
				</dl>
				<div className="mt-1 border-foreground border-t-8 pt-2">
					<div className="flex justify-between gap-2">
						<span>Next prestige</span>
						<span className="tabular-nums">+{reward} golden</span>
					</div>
					<progress
						aria-label="Progress toward prestige"
						className="monster-progress mt-2 w-full"
						max={requirement}
						value={Math.min(game.runCans, requirement)}
					/>
					<p className="mt-2 text-muted-foreground">
						* {formatGameNumber(game.runCans)} / {formatGameNumber(requirement)}{" "}
						run cans. Prestige resets the run; golden cans and permanent
						upgrades stay.
					</p>
				</div>
			</div>
			<CardFooter>
				<Button
					className="w-full"
					disabled={isSaving || game.runCans < requirement}
					onClick={onPrestige}
				>
					Prestige for {reward} golden cans
				</Button>
			</CardFooter>
		</Card>
	);
};

interface CanCardProps {
	clickLabels: ClickLabel[];
	game: GameSnapshot;
	isMuted: boolean;
	onClick: () => void;
	onToggleMute: () => void;
}

const CanCard = ({
	game,
	isMuted,
	onClick,
	onToggleMute,
	clickLabels,
}: CanCardProps) => {
	const now = game.serverNow;
	const isFrenzyActive = (game.frenzyEndsAt ?? 0) > now;
	const frenzySeconds = isFrenzyActive
		? Math.max(0, ((game.frenzyEndsAt ?? now) - now) / 1000)
		: 0;
	return (
		<Card
			className={cn(
				"order-1 overflow-visible bg-transparent ring-0 xl:col-start-2 xl:row-span-2 xl:row-start-1",
				isFrenzyActive && "monster-frenzy-card"
			)}
		>
			<CardHeader>
				<div>
					<CardTitle className="font-display text-3xl uppercase leading-none tracking-wide">
						{isFrenzyActive ? "Frenzy ×10" : "Crack a can"}
					</CardTitle>
				</div>
				<CardAction>
					<Button
						aria-label={isMuted ? "Unmute game audio" : "Mute game audio"}
						onClick={onToggleMute}
						size="icon"
						variant="outline"
					>
						{isMuted ? <VolumeXIcon /> : <Volume2Icon />}
					</Button>
				</CardAction>
			</CardHeader>
			<CardContent className="flex min-h-[390px] flex-col items-center justify-center gap-4">
				<div className="monster-can-stage">
					{isFrenzyActive
						? PARTICLES.map((particle) => (
								<span className="monster-particle" key={particle} />
							))
						: null}
					{clickLabels.map((label) => (
						<span
							className="monster-click-label"
							key={label.id}
							style={{ left: `${label.left}%` }}
						>
							+{formatGameNumber(label.amount)}
						</span>
					))}
					<button
						aria-label="Crack a Monster can"
						className={cn("monster-can-button", isFrenzyActive && "is-frenzy")}
						onClick={onClick}
						type="button"
					>
						<img
							alt=""
							className="monster-can-image"
							draggable={false}
							height={420}
							src={
								isFrenzyActive ? "/goldenmonster.png" : "/valkoinenmonster.webp"
							}
							width={420}
						/>
					</button>
				</div>
				<div className="text-center">
					<p className="font-display text-6xl tabular-nums leading-none">
						{formatGameNumber(game.cans)}
					</p>
					<p className="mt-1 text-muted-foreground uppercase tracking-[0.25em]">
						cans
					</p>
				</div>
				<p aria-live="polite" className="sr-only">
					{isFrenzyActive
						? `Frenzy active for ${frenzySeconds.toFixed(1)} seconds`
						: "Frenzy inactive"}
				</p>
			</CardContent>
		</Card>
	);
};

interface ShopCardProps {
	game: GameSnapshot;
	isSaving: boolean;
	onBuyProducer: (producerId: ProducerId) => void;
	onBuyUpgrade: (upgradeId: string) => void;
}

const ShopCard = ({
	game,
	isSaving,
	onBuyProducer,
	onBuyUpgrade,
}: ShopCardProps) => {
	const handleProducerClick = useCallback(
		(event: MouseEvent<HTMLButtonElement>) => {
			const { dataset } = event.currentTarget;
			const { producerId } = dataset;
			if (producerId) {
				onBuyProducer(producerId as ProducerId);
			}
		},
		[onBuyProducer]
	);
	const handleUpgradeClick = useCallback(
		(event: MouseEvent<HTMLButtonElement>) => {
			const { dataset } = event.currentTarget;
			const { upgradeId } = dataset;
			if (upgradeId) {
				onBuyUpgrade(upgradeId);
			}
		},
		[onBuyUpgrade]
	);

	return (
		<Card className="order-3 xl:col-start-3 xl:row-span-2 xl:row-start-1">
			<CardHeader>
				<CardTitle className="font-display text-2xl uppercase leading-none tracking-wide">
					Can shop
				</CardTitle>
				<CardDescription>
					Production, run boosts, and permanent golden upgrades.
				</CardDescription>
			</CardHeader>
			<CardContent className="monster-shop flex max-h-[75svh] flex-col gap-6 overflow-y-auto">
				<section className="flex flex-col gap-2">
					<h2 className="font-display text-base uppercase tracking-wide">
						Producers
					</h2>
					<ul className="flex flex-col gap-2">
						{PRODUCERS.map((producer) => {
							const owned = game.producers[producer.id];
							const cost = producerCost(producer.id, owned);
							return (
								<li
									className="flex items-center justify-between gap-3 bg-muted/30 p-3"
									key={producer.id}
								>
									<div>
										<h3 className="font-medium">{producer.name}</h3>
										<p className="text-muted-foreground">
											{owned} owned · {formatGameNumber(producer.baseCps)} base
											CPS
										</p>
									</div>
									<Button
										data-producer-id={producer.id}
										disabled={isSaving || game.cans < cost}
										onClick={handleProducerClick}
										size="sm"
										variant={game.cans < cost ? "outline" : "default"}
									>
										{formatGameNumber(cost)}
									</Button>
								</li>
							);
						})}
					</ul>
				</section>

				<section className="flex flex-col gap-2">
					<h2 className="font-display text-base uppercase tracking-wide">
						Run upgrades
					</h2>
					<ul className="flex flex-col gap-2">
						{RUN_UPGRADES.map((upgrade) => {
							const producerOwned = upgrade.producerId
								? game.producers[upgrade.producerId]
								: 0;
							const isOwned = game.runUpgrades.includes(upgrade.id);
							const isUnlocked =
								upgrade.requiredOwned === undefined ||
								producerOwned >= upgrade.requiredOwned;
							return (
								<li
									className="flex items-center justify-between gap-3 bg-muted/30 p-3"
									key={upgrade.id}
								>
									<div>
										<h3 className="font-medium">{upgrade.name}</h3>
										<p className="text-muted-foreground">
											{isUnlocked
												? upgrade.description
												: `Requires ${upgrade.requiredOwned} owned`}
										</p>
									</div>
									<Button
										data-upgrade-id={upgrade.id}
										disabled={
											isSaving ||
											isOwned ||
											!isUnlocked ||
											game.cans < upgrade.cost
										}
										onClick={handleUpgradeClick}
										size="sm"
										variant={
											!isOwned && isUnlocked && game.cans >= upgrade.cost
												? "default"
												: "outline"
										}
									>
										{isOwned ? "Owned" : formatGameNumber(upgrade.cost)}
									</Button>
								</li>
							);
						})}
					</ul>
				</section>

				<section className="flex flex-col gap-2">
					<h2 className="font-display text-base uppercase tracking-wide">
						Golden upgrades
					</h2>
					<ul className="flex flex-col gap-2">
						{GOLDEN_UPGRADES.map((upgrade) => {
							const rank = game.goldenUpgrades[upgrade.id];
							const cost = goldenUpgradeCost(upgrade.id, rank);
							const isUnlocked = game.prestigeLevel >= upgrade.unlockLevel;
							const isMaxed = rank >= upgrade.maxRank;
							return (
								<li
									className="flex items-center justify-between gap-3 bg-muted/30 p-3"
									key={upgrade.id}
								>
									<div>
										<h3 className="font-medium">{upgrade.name}</h3>
										<p className="text-muted-foreground">
											{isUnlocked
												? upgrade.description
												: `Unlocks at prestige ${upgrade.unlockLevel}`}
										</p>
										<p className="text-muted-foreground">
											Rank {rank}/{upgrade.maxRank}
										</p>
									</div>
									<Button
										className="bg-monster-gold text-monster-gold-foreground hover:bg-monster-gold/80"
										data-upgrade-id={upgrade.id}
										disabled={
											isSaving ||
											!isUnlocked ||
											isMaxed ||
											game.goldenCans < cost
										}
										onClick={handleUpgradeClick}
										size="sm"
										variant="secondary"
									>
										{isMaxed ? "Max" : `${cost} golden`}
									</Button>
								</li>
							);
						})}
					</ul>
				</section>
			</CardContent>
		</Card>
	);
};

interface LeaderboardEntry {
	lifetimeCans: number;
	name: string;
	prestigeLevel: number;
	rank: number;
	userId: string;
}

interface LeaderboardCardProps {
	entries: LeaderboardEntry[];
	isAnonymous: boolean;
	viewerId: string;
}

const LeaderboardCard = ({
	entries,
	isAnonymous,
	viewerId,
}: LeaderboardCardProps) => {
	const leaderboardTrackedRef = useRef(false);

	useEffect(() => {
		if (entries.length === 0 || leaderboardTrackedRef.current) {
			return;
		}
		leaderboardTrackedRef.current = true;
		track(AnalyticsEvents.ui.leaderboardViewed, {
			entry_count: entries.length,
			is_anonymous: isAnonymous,
			viewer_on_board: entries.some((entry) => entry.userId === viewerId),
		});
	}, [entries, isAnonymous, viewerId]);

	return (
		<Card className="order-4 self-start xl:col-start-1 xl:row-start-2">
			<CardHeader>
				<CardTitle className="font-display text-2xl uppercase leading-none tracking-wide">
					Leaderboard
				</CardTitle>
				<CardDescription>
					Top registered players by lifetime cans.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{entries.length === 0 ? (
					<p className="text-muted-foreground">
						No ranked players yet. Claim the first spot.
					</p>
				) : (
					<ol className="flex flex-col gap-2">
						{entries.slice(0, 10).map((entry) => (
							<li
								className={cn(
									"grid grid-cols-[2rem_1fr_auto] items-center gap-2 p-2",
									entry.userId === viewerId && "bg-muted"
								)}
								key={entry.userId}
							>
								<span className="text-muted-foreground tabular-nums">
									#{entry.rank}
								</span>
								<span className="truncate">{entry.name}</span>
								<span className="text-right tabular-nums">
									{formatGameNumber(entry.lifetimeCans)}
									<small className="block text-muted-foreground">
										P{entry.prestigeLevel}
									</small>
								</span>
							</li>
						))}
					</ol>
				)}
			</CardContent>
			{isAnonymous ? (
				<CardFooter>
					<Link className="w-full" to="/login">
						<Button
							className="w-full"
							data-rybbit-event="nav.claim_progress"
							data-rybbit-prop-source="leaderboard"
						>
							Claim progress to compete
						</Button>
					</Link>
				</CardFooter>
			) : null}
		</Card>
	);
};

export const MonsterGame = () => {
	const trpc = useTRPC();
	const sessionQuery = authClient.useSession();
	const anonymousSignInStarted = useRef(false);
	const [game, setGame] = useState<GameSnapshot | null>(null);
	const gameRef = useRef<GameSnapshot | null>(null);
	const pendingClicksRef = useRef(0);
	const mutationLockedRef = useRef(false);
	const [isSaving, setIsSaving] = useState(false);
	const [clickLabels, setClickLabels] = useState<ClickLabel[]>([]);
	const [clicksPerSecond, setClicksPerSecond] = useState(0);
	const clickTimesRef = useRef<number[]>([]);
	const clickLabelIdRef = useRef(0);
	const clickLabelTimeoutsRef = useRef(new Set<number>());
	const [isMuted, setIsMuted] = useState(() =>
		typeof window === "undefined"
			? false
			: window.localStorage.getItem("monster-muted") === "true"
	);
	const canAudioPoolRef = useRef<HTMLAudioElement[]>([]);
	const canAudioIndexRef = useRef(0);
	const dubstepAudioRef = useRef<HTMLAudioElement | null>(null);
	const totalClicksRef = useRef(0);
	const gameLoadedTrackedRef = useRef(false);
	const lastIdleReportAtRef = useRef(0);
	const prestigeReadyTrackedRef = useRef(false);
	const wasFrenzyActiveRef = useRef(false);

	const isAuthenticated = Boolean(sessionQuery.data);
	const stateQuery = useQuery({
		...trpc.game.getState.queryOptions(),
		enabled: isAuthenticated,
	});
	const leaderboardQuery = useQuery({
		...trpc.leaderboard.list.queryOptions(),
		enabled: isAuthenticated,
		refetchInterval: 30_000,
	});
	const {
		data: session,
		isPending: isSessionPending,
		refetch: refetchSession,
	} = sessionQuery;
	const {
		data: stateData,
		isLoading: isStateLoading,
		refetch: refetchState,
	} = stateQuery;
	const { mutateAsync: syncGame } = useMutation(
		trpc.game.sync.mutationOptions()
	);
	const { mutateAsync: buyProducerMutation } = useMutation(
		trpc.game.buyProducer.mutationOptions()
	);
	const { mutateAsync: buyUpgradeMutation } = useMutation(
		trpc.game.buyUpgrade.mutationOptions()
	);
	const { mutateAsync: triggerFrenzyMutation } = useMutation(
		trpc.game.triggerFrenzy.mutationOptions()
	);
	const { mutateAsync: prestigeMutation } = useMutation(
		trpc.game.prestige.mutationOptions()
	);

	const updateGame = useCallback(
		(updater: (current: GameSnapshot) => GameSnapshot) => {
			setGame((current) => {
				if (!current) {
					return current;
				}
				const next = updater(current);
				gameRef.current = next;
				return next;
			});
		},
		[]
	);

	useEffect(() => {
		if (!(stateData && session) || gameLoadedTrackedRef.current) {
			return;
		}
		gameLoadedTrackedRef.current = true;
		track(AnalyticsEvents.game.loaded, {
			is_anonymous: Boolean(session.user.isAnonymous),
			lifetime_cans_bucket: bucketCans(stateData.lifetimeCans),
			prestige_level: stateData.prestigeLevel,
		});
		setUserTraits({ prestige_level: stateData.prestigeLevel });
	}, [session, stateData]);

	useEffect(() => {
		const idleReport = stateData?.idleReport;
		const idleReportAt = stateData?.lastAccruedAt ?? 0;
		if (!idleReport || idleReportAt <= lastIdleReportAtRef.current) {
			return;
		}
		lastIdleReportAtRef.current = idleReportAt;
		const averageCps = idleReport.cansEarned / (idleReport.elapsedMs / 1000);
		const offlineRate =
			OFFLINE_PRODUCTION_MULTIPLIER *
			((stateData?.goldenUpgrades["time-capsule"] ?? 0) > 0 ? 2 : 1);
		toast.success("Welcome back", {
			description: `${formatElapsedTime(idleReport.elapsedMs)} away · ${formatGameNumber(idleReport.cansEarned)} cans · ${formatGameNumber(averageCps)} cans/s average · ${offlineRate * 100}% idle rate`,
			duration: 12_000,
		});
		track(AnalyticsEvents.game.offlineReturn, {
			elapsed_bucket: bucketElapsedMs(idleReport.elapsedMs),
			had_frenzy: idleReport.hadFrenzy,
			idle_gain_bucket: bucketCans(idleReport.cansEarned),
		});
	}, [stateData]);

	useEffect(() => {
		if (!game) {
			return;
		}
		const requirement = prestigeRequirement(game.totalGoldenCans);
		if (game.runCans >= requirement && !prestigeReadyTrackedRef.current) {
			prestigeReadyTrackedRef.current = true;
			track(AnalyticsEvents.game.prestigeReady, {
				prestige_level: game.prestigeLevel,
				reward_golden_cans: prestigeReward(game.runCans, game.totalGoldenCans),
				run_cans_bucket: bucketCans(game.runCans),
			});
		}
	}, [game]);

	useEffect(() => {
		if (isSessionPending || session || anonymousSignInStarted.current) {
			return;
		}
		anonymousSignInStarted.current = true;
		const signIn = async () => {
			const result = await authClient.signIn.anonymous();
			if (result.error) {
				anonymousSignInStarted.current = false;
				track(AnalyticsEvents.auth.anonymousFailed, {
					error_code: "anonymous_sign_in",
				});
				toast.error(result.error.message ?? "Could not create a guest save");
				return;
			}
			track(AnalyticsEvents.auth.anonymousSucceeded);
			await refetchSession();
		};
		signIn().catch(() => {
			anonymousSignInStarted.current = false;
			track(AnalyticsEvents.auth.anonymousFailed, {
				error_code: "anonymous_sign_in",
			});
			toast.error("Could not create a guest save");
		});
	}, [isSessionPending, refetchSession, session]);

	useEffect(() => {
		if (!stateData) {
			return;
		}
		const projected = projectElapsed(stateData, Date.now());
		gameRef.current = projected;
		setGame(projected);
	}, [stateData]);

	useEffect(() => {
		const timer = window.setInterval(() => {
			const now = Date.now();
			clickTimesRef.current = clickTimesRef.current.filter(
				(clickedAt) => clickedAt > now - 1000
			);
			setClicksPerSecond(clickTimesRef.current.length);
			updateGame((current) => projectElapsed(current, now));
		}, DISPLAY_TICK_MS);
		return () => window.clearInterval(timer);
	}, [updateGame]);

	useEffect(() => {
		window.localStorage.setItem("monster-muted", String(isMuted));
	}, [isMuted]);

	useEffect(
		() => () => {
			for (const timeout of clickLabelTimeoutsRef.current) {
				window.clearTimeout(timeout);
			}
		},
		[]
	);

	const isFrenzyActive = game
		? (game.frenzyEndsAt ?? 0) > game.serverNow
		: false;
	useEffect(() => {
		if (!isFrenzyActive || isMuted) {
			if (dubstepAudioRef.current) {
				dubstepAudioRef.current.pause();
				if (!isFrenzyActive) {
					dubstepAudioRef.current.currentTime = 0;
				}
			}
			return;
		}
		const audio = dubstepAudioRef.current ?? new Audio("/dubstep.mp3");
		audio.volume = 0.55;
		dubstepAudioRef.current = audio;
		audio.play().catch(() => undefined);
	}, [isFrenzyActive, isMuted]);

	useEffect(() => {
		if (wasFrenzyActiveRef.current && !isFrenzyActive && game) {
			track(AnalyticsEvents.game.frenzyEnded, {
				duration_ms: FRENZY_DURATION_MS,
				prestige_level: game.prestigeLevel,
			});
		}
		wasFrenzyActiveRef.current = isFrenzyActive;
	}, [game, isFrenzyActive]);

	const performMutation = useCallback(
		async (
			action: MutationAction,
			options: MutationOptions
		): Promise<boolean> => {
			const { current } = gameRef;
			if (!current || mutationLockedRef.current) {
				return false;
			}
			const before = current;
			mutationLockedRef.current = true;
			setIsSaving(true);
			const sentClicks = pendingClicksRef.current;
			pendingClicksRef.current = 0;
			try {
				const result = await action({
					operationId: crypto.randomUUID(),
					pendingManualClicks: sentClicks,
					revision: current.revision,
				});
				const projected = projectPendingClicks(
					result,
					Date.now(),
					pendingClicksRef.current
				);
				gameRef.current = projected;
				setGame(projected);

				switch (options.action) {
					case "buy_producer": {
						if (!options.producerId) {
							break;
						}
						const source = options.producerSource ?? "manual";
						const eventName =
							source === "smart_stocker"
								? AnalyticsEvents.game.purchaseProducerAuto
								: AnalyticsEvents.game.purchaseProducer;
						track(eventName, {
							cost: producerCost(
								options.producerId,
								before.producers[options.producerId]
							),
							owned_after: projected.producers[options.producerId],
							producer_id: options.producerId,
							source,
						});
						break;
					}
					case "buy_upgrade": {
						if (!options.upgradeId) {
							break;
						}
						if (isGoldenUpgradeId(options.upgradeId)) {
							const rank = projected.goldenUpgrades[options.upgradeId];
							track(AnalyticsEvents.game.purchaseGoldenUpgrade, {
								cost_golden: goldenUpgradeCost(
									options.upgradeId,
									Math.max(0, rank - 1)
								),
								prestige_level: projected.prestigeLevel,
								rank_after: rank,
								upgrade_id: options.upgradeId,
							});
						} else {
							const upgrade = RUN_UPGRADES.find(
								(entry) => entry.id === options.upgradeId
							);
							track(AnalyticsEvents.game.purchaseRunUpgrade, {
								cans_bucket: bucketCans(projected.cans),
								cost: upgrade?.cost ?? 0,
								upgrade_id: options.upgradeId,
							});
						}
						break;
					}
					case "prestige": {
						prestigeReadyTrackedRef.current = false;
						track(AnalyticsEvents.game.prestigeConfirmed, {
							prestige_level: before.prestigeLevel,
							reward_golden_cans: prestigeReward(
								before.runCans,
								before.totalGoldenCans
							),
							run_cans_bucket: bucketCans(before.runCans),
						});
						setUserTraits({ prestige_level: projected.prestigeLevel });
						break;
					}
					case "trigger_frenzy": {
						track(AnalyticsEvents.game.frenzyStarted, {
							cps_bucket: bucketCps(calculateCps(projected)),
							prestige_level: projected.prestigeLevel,
							run_cans_bucket: bucketCans(projected.runCans),
						});
						break;
					}
					default:
						break;
				}

				return true;
			} catch (error) {
				pendingClicksRef.current += sentClicks;
				track(AnalyticsEvents.game.error, {
					action: options.action,
					error_code: getErrorCode(error),
				});
				trackError(error, {
					action: options.action,
					source: "game_mutation",
				});
				if (!options.silent) {
					toast.error(
						error instanceof Error ? error.message : "Could not save game"
					);
				}
				const refreshed = await refetchState();
				if (refreshed.data) {
					const projected = projectPendingClicks(
						refreshed.data,
						Date.now(),
						pendingClicksRef.current
					);
					gameRef.current = projected;
					setGame(projected);
				}
				return false;
			} finally {
				mutationLockedRef.current = false;
				setIsSaving(false);
			}
		},
		[refetchState]
	);

	const syncNow = useCallback(
		() =>
			performMutation((input) => syncGame(input), {
				action: "sync",
				silent: true,
			}),
		[performMutation, syncGame]
	);

	const buyProducerNow = useCallback(
		(
			producerId: ProducerId,
			producerSource: "manual" | "smart_stocker" = "manual"
		) =>
			performMutation(
				(input) => buyProducerMutation({ ...input, producerId }),
				{
					action: "buy_producer",
					producerId,
					producerSource,
				}
			),
		[buyProducerMutation, performMutation]
	);

	const buyUpgradeNow = useCallback(
		(upgradeId: string) =>
			performMutation((input) => buyUpgradeMutation({ ...input, upgradeId }), {
				action: "buy_upgrade",
				upgradeId,
			}),
		[buyUpgradeMutation, performMutation]
	);

	const triggerFrenzyNow = useCallback(
		() =>
			performMutation((input) => triggerFrenzyMutation(input), {
				action: "trigger_frenzy",
				silent: true,
			}),
		[performMutation, triggerFrenzyMutation]
	);

	const prestigeNow = useCallback(
		() =>
			performMutation((input) => prestigeMutation(input), {
				action: "prestige",
			}),
		[performMutation, prestigeMutation]
	);

	useEffect(() => {
		const timer = window.setInterval(() => {
			const { current } = gameRef;
			if (!current || mutationLockedRef.current) {
				return;
			}
			if (current.goldenUpgrades["smart-stocker"] > 0) {
				const producerId = cheapestAffordableProducer(current, current.cans);
				if (producerId) {
					buyProducerNow(producerId, "smart_stocker").catch(() => undefined);
					return;
				}
			}
			syncNow().catch(() => undefined);
		}, HEARTBEAT_MS);
		return () => window.clearInterval(timer);
	}, [buyProducerNow, syncNow]);

	const playCanSound = useCallback(() => {
		if (isMuted) {
			return;
		}
		if (canAudioPoolRef.current.length === 0) {
			canAudioPoolRef.current = Array.from(
				{ length: CAN_AUDIO_POOL_SIZE },
				() => {
					const audio = new Audio("/can.mp3");
					audio.volume = 0.35;
					return audio;
				}
			);
		}
		const audio = canAudioPoolRef.current[canAudioIndexRef.current];
		canAudioIndexRef.current =
			(canAudioIndexRef.current + 1) % CAN_AUDIO_POOL_SIZE;
		if (audio) {
			audio.currentTime = 0;
			audio.play().catch(() => undefined);
		}
	}, [isMuted]);

	const clickCan = useCallback(() => {
		const { current } = gameRef;
		if (!current) {
			return;
		}
		playCanSound();
		pendingClicksRef.current += 1;
		totalClicksRef.current += 1;
		const milestone = getClickMilestone(totalClicksRef.current);
		const now = Date.now();
		clickTimesRef.current.push(now);
		setClicksPerSecond(clickTimesRef.current.length);
		const frenzyActive = (current.frenzyEndsAt ?? 0) > now;
		const amount =
			calculateClickValue(current) * (frenzyActive ? FRENZY_MULTIPLIER : 1);
		if (milestone) {
			track(AnalyticsEvents.game.clickMilestone, {
				click_value: amount,
				is_frenzy_active: frenzyActive,
				milestone,
				prestige_level: current.prestigeLevel,
			});
		}
		const triggersFrenzy = !frenzyActive && current.nextFrenzyClick <= 1;
		updateGame((state) => {
			const nextFrenzyClick = frenzyActive
				? state.nextFrenzyClick
				: Math.max(0, state.nextFrenzyClick - 1);
			return {
				...state,
				bestRunCans: clampGameValue(
					Math.max(state.bestRunCans, state.runCans + amount)
				),
				cans: clampGameValue(state.cans + amount),
				frenzyEndsAt: triggersFrenzy
					? now + FRENZY_DURATION_MS
					: state.frenzyEndsAt,
				lifetimeCans: clampGameValue(state.lifetimeCans + amount),
				nextFrenzyClick,
				runCans: clampGameValue(state.runCans + amount),
			};
		});

		const id = clickLabelIdRef.current + 1;
		clickLabelIdRef.current = id;
		setClickLabels((labels) => [
			...labels,
			{ amount, id, left: 32 + Math.random() * 36 },
		]);
		const timeout = window.setTimeout(() => {
			setClickLabels((labels) => labels.filter((label) => label.id !== id));
			clickLabelTimeoutsRef.current.delete(timeout);
		}, 750);
		clickLabelTimeoutsRef.current.add(timeout);

		if (triggersFrenzy) {
			triggerFrenzyNow().catch(() => undefined);
		}
	}, [playCanSound, triggerFrenzyNow, updateGame]);

	const confirmPrestige = useCallback(() => {
		const { current } = gameRef;
		if (!current) {
			return;
		}
		const reward = prestigeReward(current.runCans, current.totalGoldenCans);
		// biome-ignore lint/suspicious/noAlert: The agreed game flow uses the browser's native confirmation.
		const confirmed = window.confirm(
			`Reset this run for ${reward} golden cans? Permanent upgrades and lifetime cans stay.`
		);
		if (confirmed) {
			prestigeNow().catch(() => undefined);
		} else {
			track(AnalyticsEvents.game.prestigeCancelled, {
				prestige_level: current.prestigeLevel,
			});
		}
	}, [prestigeNow]);

	const toggleMute = useCallback(() => {
		setIsMuted((muted) => {
			track(AnalyticsEvents.ui.audioToggled, { muted: !muted });
			return !muted;
		});
	}, []);
	const handleBuyProducer = useCallback(
		(producerId: ProducerId) => {
			buyProducerNow(producerId).catch(() => undefined);
		},
		[buyProducerNow]
	);
	const handleBuyUpgrade = useCallback(
		(upgradeId: string) => {
			buyUpgradeNow(upgradeId).catch(() => undefined);
		},
		[buyUpgradeNow]
	);

	if (isSessionPending || !session || isStateLoading || !game) {
		return <GameLoading />;
	}

	return (
		<main
			className={cn(
				"monster-game mx-auto grid w-full max-w-[1440px] gap-4 px-4 pt-4 pb-8 xl:grid-cols-[300px_minmax(340px,1fr)_380px] xl:grid-rows-[auto_1fr]",
				isFrenzyActive && "is-frenzy"
			)}
		>
			<StatsCard
				clicksPerSecond={clicksPerSecond}
				game={game}
				isSaving={isSaving}
				onPrestige={confirmPrestige}
			/>
			<CanCard
				clickLabels={clickLabels}
				game={game}
				isMuted={isMuted}
				onClick={clickCan}
				onToggleMute={toggleMute}
			/>
			<ShopCard
				game={game}
				isSaving={isSaving}
				onBuyProducer={handleBuyProducer}
				onBuyUpgrade={handleBuyUpgrade}
			/>
			<LeaderboardCard
				entries={leaderboardQuery.data ?? []}
				isAnonymous={Boolean(session.user.isAnonymous)}
				viewerId={session.user.id}
			/>
		</main>
	);
};
