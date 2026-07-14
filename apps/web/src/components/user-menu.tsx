import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@valkoinenmonsterv2/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@valkoinenmonsterv2/ui/components/dropdown-menu";
import { Skeleton } from "@valkoinenmonsterv2/ui/components/skeleton";

import { AnalyticsEvents } from "@/lib/analytics/events";
import { clearUser, track } from "@/lib/analytics/track";
import { authClient } from "@/lib/auth-client";

export default function UserMenu() {
	const navigate = useNavigate();
	const { data: session, isPending } = authClient.useSession();

	if (isPending) {
		return <Skeleton className="h-9 w-24" />;
	}

	if (!session || session.user.isAnonymous) {
		return (
			<Link to="/login">
				<Button
					data-rybbit-event="nav.claim_progress"
					data-rybbit-prop-source="header"
					variant="outline"
				>
					Claim progress
				</Button>
			</Link>
		);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger render={<Button variant="outline" />}>
				{session.user.name}
			</DropdownMenuTrigger>
			<DropdownMenuContent className="bg-card">
				<DropdownMenuGroup>
					<DropdownMenuLabel>My Account</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuItem>{session.user.email}</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => {
							track(AnalyticsEvents.auth.signOut);
							clearUser();
							authClient.signOut({
								fetchOptions: {
									onSuccess: () => {
										navigate({ to: "/" });
										window.location.reload();
									},
								},
							});
						}}
						variant="destructive"
					>
						Sign Out
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
