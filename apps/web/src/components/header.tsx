import { Link } from "@tanstack/react-router";
import { Button } from "@valkoinenmonsterv2/ui/components/button";
import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback } from "react";
import { AnalyticsEvents } from "@/lib/analytics/events";
import { track } from "@/lib/analytics/track";
import UserMenu from "./user-menu";

function ThemeToggle() {
	const { resolvedTheme, setTheme } = useTheme();
	const toggleTheme = useCallback(() => {
		const nextTheme = resolvedTheme === "dark" ? "light" : "dark";
		setTheme(nextTheme);
		track(AnalyticsEvents.ui.themeChanged, { theme: nextTheme });
	}, [resolvedTheme, setTheme]);
	return (
		<Button
			aria-label="Toggle dark mode"
			onClick={toggleTheme}
			size="icon"
			variant="outline"
		>
			<SunIcon className="dark:hidden" />
			<MoonIcon className="hidden dark:block" />
		</Button>
	);
}

export default function Header() {
	return (
		<header className="flex items-center justify-between border-border border-b px-4 py-3">
			<Link
				className="flex items-baseline gap-3"
				data-rybbit-event="nav.logo_clicked"
				to="/"
			>
				<span className="font-display text-xl uppercase leading-none tracking-wide">
					Valkoinen Monster
				</span>
				<span className="hidden text-muted-foreground text-xs uppercase tracking-[0.2em] sm:inline">
					Energiajuoma · Zero sugar
				</span>
			</Link>
			<div className="flex items-center gap-2">
				<ThemeToggle />
				<UserMenu />
			</div>
		</header>
	);
}
