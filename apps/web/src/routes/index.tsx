import { createFileRoute } from "@tanstack/react-router";

import { MonsterGame } from "@/components/monster-game";

export const Route = createFileRoute("/")({
	component: MonsterGame,
	ssr: false,
});
