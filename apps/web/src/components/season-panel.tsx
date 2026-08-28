import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { formatGameNumber } from "@valkoinenmonsterv2/api/game";
import type { SeasonSnapshot } from "@valkoinenmonsterv2/api/routers/season";
import {
	calculateSeasonClickValue,
	calculateSeasonCps,
	getSeasonTheme,
	seasonProducerCost,
} from "@valkoinenmonsterv2/api/seasons";
import { Button } from "@valkoinenmonsterv2/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@valkoinenmonsterv2/ui/components/card";
import { cn } from "@valkoinenmonsterv2/ui/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnalyticsEvents } from "@/lib/analytics/events";
import { track } from "@/lib/analytics/track";
import { useTRPC } from "@/utils/trpc";

const TAP_FLUSH_MS = 1500;

const formatCountdown = (msRemaining: number): string => {
	const safeMs = Math.max(0, msRemaining);
	const days = Math.floor(safeMs / 86_400_000);
	const hours = Math.floor((safeMs % 86_400_000) / 3_600_000);
	const minutes = Math.floor((safeMs % 3_600_000) / 60_000);
	if (days > 0) {
		return `${days}d ${hours}h`;
	}
	if (hours > 0) {
		return `${hours}h ${minutes}m`;
	}
	return `${minutes}m`;
};

interface SeasonPanelProps {
	isAnonymous: boolean;
	viewerId: string;
}

const useNowTick = (intervalMs: number): number => {
	const [nowMs, setNowMs] = useState(() => Date.now());
	useEffect(() => {
		const timer = window.setInterval(() => setNowMs(Date.now()), intervalMs);
		return () => window.clearInterval(timer);
	}, [intervalMs]);
	return nowMs;
};

const SEASON_CARD_ID = "season-event";

export const SeasonBanner = () => {
	const trpc = useTRPC();
	const overviewQuery = useQuery({
		...trpc.season.current.queryOptions(),
		refetchInterval: 30_000,
	});
	const overview = overviewQuery.data;
	const nowMs = useNowTick(1000);
	if (!overview) {
		return null;
	}
	const { season, viewerRank } = overview;
	return (
		<a
			className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 xl:col-span-3"
			href={`#${SEASON_CARD_ID}`}
			onClick={() => {
				track(AnalyticsEvents.season.bannerClicked, {
					season_id: season.id,
					theme_id: season.themeId,
				});
			}}
		>
			<span className="flex min-w-0 items-center gap-2">
				<span
					aria-hidden
					className="size-2 shrink-0 animate-pulse rounded-full bg-amber-400"
				/>
				<span className="font-display truncate text-sm uppercase leading-none tracking-wide">
					{season.name} live
				</span>
				<span className="hidden text-muted-foreground text-sm sm:inline">
					· fixed rules, no golden upgrades
				</span>
			</span>
			<span className="shrink-0 text-right text-sm tabular-nums">
				{viewerRank !== null && `You're #${viewerRank} · `}
				ends in {formatCountdown(season.endsAt - nowMs)}
			</span>
		</a>
	);
};

export const SeasonPanel = ({ isAnonymous, viewerId }: SeasonPanelProps) => {
	const trpc = useTRPC();
	const overviewQuery = useQuery({
		...trpc.season.current.queryOptions(),
		refetchInterval: 30_000,
	});
	const { mutateAsync: syncSeason } = useMutation(
		trpc.season.sync.mutationOptions()
	);
	const { mutateAsync: buyProducerMutation } = useMutation(
		trpc.season.buyProducer.mutationOptions()
	);
	const { mutateAsync: buyUpgradeMutation } = useMutation(
		trpc.season.buyUpgrade.mutationOptions()
	);

	const overview = overviewQuery.data;
	const [snapshot, setSnapshot] = useState<SeasonSnapshot | null>(null);
	const pendingTapsRef = useRef(0);
	const viewedTrackedRef = useRef(false);
	const nowMs = useNowTick(1000);

	useEffect(() => {
		if (overview) {
			setSnapshot(overview.snapshot);
		}
	}, [overview]);

	useEffect(() => {
		if (!(overview && viewedTrackedRef.current === false)) {
			return;
		}
		viewedTrackedRef.current = true;
		track(AnalyticsEvents.season.viewed, {
			season_id: overview.season.id,
			theme_id: overview.season.themeId,
		});
	}, [overview]);

	const flushTaps = useCallback(async () => {
		const pendingTaps = pendingTapsRef.current;
		if (!snapshot || pendingTaps === 0) {
			return;
		}
		pendingTapsRef.current = 0;
		try {
			const result = await syncSeason({
				operationId: crypto.randomUUID(),
				pendingManualClicks: pendingTaps,
				revision: snapshot.revision,
			});
			setSnapshot(result.snapshot);
			const rejected = pendingTaps - result.acceptedClicks;
			pendingTapsRef.current += rejected;
			track(AnalyticsEvents.season.tap, {
				accepted: result.acceptedClicks,
				season_id: overview?.season.id ?? "",
				sent: pendingTaps,
			});
		} catch {
			pendingTapsRef.current += pendingTaps;
			overviewQuery.refetch();
		}
	}, [overview?.season.id, overviewQuery, snapshot, syncSeason]);

	useEffect(() => {
		const timer = window.setInterval(() => {
			void flushTaps();
		}, TAP_FLUSH_MS);
		return () => window.clearInterval(timer);
	}, [flushTaps]);

	if (!(overview && snapshot)) {
		return <SeasonPanelSkeleton />;
	}

	const season = overview.season;
	const theme = getSeasonTheme(season.themeId);
	const clickValue = calculateSeasonClickValue(theme.id, snapshot.upgrades);
	const cps = calculateSeasonCps(
		theme.id,
		snapshot.producers,
		snapshot.upgrades
	);

	const handleBuyProducer = async (producerId: string) => {
		try {
			const result = await buyProducerMutation({
				operationId: crypto.randomUUID(),
				pendingManualClicks: 0,
				producerId,
				revision: snapshot.revision,
			});
			setSnapshot(result.snapshot);
			track(AnalyticsEvents.season.purchaseProducer, {
				producerId,
				season_id: season.id,
			});
		} catch {
			overviewQuery.refetch();
		}
	};

	const handleBuyUpgrade = async (upgradeId: string) => {
		try {
			const result = await buyUpgradeMutation({
				operationId: crypto.randomUUID(),
				pendingManualClicks: 0,
				revision: snapshot.revision,
				upgradeId,
			});
			setSnapshot(result.snapshot);
			track(AnalyticsEvents.season.purchaseUpgrade, {
				season_id: season.id,
				upgradeId,
			});
		} catch {
			overviewQuery.refetch();
		}
	};

	const handleTap = () => {
		pendingTapsRef.current += 1;
	};

	return (
		<Card className="order-6 self-start scroll-mt-4" id={SEASON_CARD_ID}>
			<CardHeader>
				<CardTitle className="font-display text-2xl uppercase leading-none tracking-wide">
					Season Event: {season.name}
				</CardTitle>
				<CardDescription>
					{season.tagline} Everyone starts equal — no golden upgrades. Ends in{" "}
					{formatCountdown(season.endsAt - nowMs)}.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div className="flex items-center justify-between gap-2">
					<div>
						<p className="font-medium tabular-nums">
							{formatGameNumber(snapshot.score)} season cans
						</p>
						<p className="text-muted-foreground text-sm tabular-nums">
							{formatGameNumber(cps)}/s · #{overview.viewerRank ?? "—"} of{" "}
							{overview.leaderboard.length > 0 ? "50" : "1"} ranked players
						</p>
					</div>
					<Button onClick={handleTap} size="lg" type="button">
						Tap (+{formatGameNumber(clickValue)})
					</Button>
				</div>

				<section aria-label="Season exclusive producers">
					<h3 className="mb-1 font-medium text-sm uppercase">
						Exclusive producers
					</h3>
					<ul className="flex flex-col gap-1">
						{theme.producers.map((producer) => {
							const owned = snapshot.producers[producer.id] ?? 0;
							const cost = seasonProducerCost(producer, owned);
							const affordable = snapshot.cans >= cost;
							return (
								<li
									className="flex items-center justify-between gap-2"
									key={producer.id}
								>
									<span>
										{producer.name}{" "}
										<span className="text-muted-foreground">
											×{owned} · {formatGameNumber(producer.baseCps)}/s
										</span>
									</span>
									<Button
										disabled={!affordable}
										onClick={() => void handleBuyProducer(producer.id)}
										size="sm"
										type="button"
										variant={affordable ? "default" : "outline"}
									>
										{formatGameNumber(cost)}
									</Button>
								</li>
							);
						})}
					</ul>
				</section>

				<section aria-label="Season exclusive upgrades">
					<h3 className="mb-1 font-medium text-sm uppercase">
						Exclusive upgrades
					</h3>
					<ul className="flex flex-col gap-1">
						{theme.upgrades.map((upgrade) => {
							const owned = snapshot.upgrades.includes(upgrade.id);
							const affordable = snapshot.cans >= upgrade.cost;
							return (
								<li
									className={cn(
										"flex items-center justify-between gap-2",
										owned && "bg-muted/30"
									)}
									key={upgrade.id}
								>
									<span>
										{owned ? "★" : "☆"} {upgrade.name}{" "}
										<span className="text-muted-foreground">
											{upgrade.description}
										</span>
									</span>
									{owned ? (
										<span className="text-muted-foreground text-sm">Owned</span>
									) : (
										<Button
											disabled={!affordable}
											onClick={() => void handleBuyUpgrade(upgrade.id)}
											size="sm"
											type="button"
											variant={affordable ? "default" : "outline"}
										>
											{formatGameNumber(upgrade.cost)}
										</Button>
									)}
								</li>
							);
						})}
					</ul>
				</section>

				<section aria-label="Season leaderboard">
					<h3 className="mb-1 font-medium text-sm uppercase">
						Season leaderboard
					</h3>
					{overview.leaderboard.length === 0 ? (
						<p className="text-muted-foreground">
							No ranked players yet this season.
						</p>
					) : (
						<ol className="flex flex-col gap-1">
							{overview.leaderboard.slice(0, 10).map((entry) => (
								<li
									className={cn(
										"grid grid-cols-[2rem_1fr_auto] items-center gap-2 p-1",
										entry.userId === viewerId && "bg-muted"
									)}
									key={entry.userId}
								>
									<span className="text-muted-foreground tabular-nums">
										#{entry.rank}
									</span>
									<span className="truncate">{entry.name}</span>
									<span className="text-right tabular-nums">
										{formatGameNumber(entry.score)}
									</span>
								</li>
							))}
						</ol>
					)}
				</section>
			</CardContent>
			{isAnonymous ? (
				<CardFooter>
					<Link className="w-full" to="/login">
						<Button className="w-full" type="button">
							Claim progress to compete
						</Button>
					</Link>
				</CardFooter>
			) : null}
		</Card>
	);
};

const SeasonPanelSkeleton = () => (
	<Card className="order-6 self-start scroll-mt-4" id={SEASON_CARD_ID}>
		<CardHeader>
			<CardTitle className="font-display text-2xl uppercase leading-none tracking-wide">
				Season Event
			</CardTitle>
			<CardDescription>Loading the current event…</CardDescription>
		</CardHeader>
		<CardContent className="flex flex-col gap-2">
			<div className="h-16" />
		</CardContent>
	</Card>
);
