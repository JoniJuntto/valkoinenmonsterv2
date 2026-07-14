import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";
import { AnalyticsEvents } from "@/lib/analytics/events";
import { track } from "@/lib/analytics/track";

export const Route = createFileRoute("/login")({
	component: RouteComponent,
});

function RouteComponent() {
	const [showSignIn, setShowSignIn] = useState(false);

	useEffect(() => {
		track(AnalyticsEvents.auth.formViewed, {
			form: showSignIn ? "sign_in" : "sign_up",
		});
	}, [showSignIn]);

	return showSignIn ? (
		<SignInForm
			onSwitchToSignUp={() => {
				track(AnalyticsEvents.auth.formSwitched, {
					from: "sign_in",
					to: "sign_up",
				});
				setShowSignIn(false);
			}}
		/>
	) : (
		<SignUpForm
			onSwitchToSignIn={() => {
				track(AnalyticsEvents.auth.formSwitched, {
					from: "sign_up",
					to: "sign_in",
				});
				setShowSignIn(true);
			}}
		/>
	);
}
