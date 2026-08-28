import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@valkoinenmonsterv2/ui/components/button";
import { Input } from "@valkoinenmonsterv2/ui/components/input";
import { Label } from "@valkoinenmonsterv2/ui/components/label";
import { toast } from "sonner";
import z from "zod";

import { AnalyticsEvents } from "@/lib/analytics/events";
import { track } from "@/lib/analytics/track";
import { authClient } from "@/lib/auth-client";

// ponytail: one route for both halves of the flow — the reset link just adds
// ?token=, so a second route would only duplicate the layout
export const Route = createFileRoute("/reset-password")({
	component: RouteComponent,
	ssr: false,
	validateSearch: z.object({
		error: z.string().optional(),
		token: z.string().optional(),
	}),
});

function RouteComponent() {
	const { error, token } = Route.useSearch();

	if (token) {
		return <ResetForm token={token} />;
	}

	return <RequestForm invalidToken={Boolean(error)} />;
}

function RequestForm({ invalidToken }: { invalidToken: boolean }) {
	const form = useForm({
		defaultValues: {
			email: "",
		},
		onSubmit: async ({ value }) => {
			track(AnalyticsEvents.auth.passwordResetRequested);
			await authClient.requestPasswordReset(
				{
					email: value.email,
					redirectTo: `${window.location.origin}/reset-password`,
				},
				{
					onError: (err) => {
						toast.error(err.error.message || err.error.statusText);
					},
					// better-auth answers the same way whether or not the account
					// exists, so don't leak it in the toast either
					onSuccess: () => {
						toast.success(
							"If that email has an account, a reset link is on its way"
						);
					},
				}
			);
		},
		validators: {
			onSubmit: z.object({
				email: z.email("Invalid email address"),
			}),
		},
	});

	return (
		<div className="mx-auto mt-10 w-full max-w-md p-6">
			<h1 className="mb-6 text-center font-bold text-3xl">Forgot Password</h1>

			{invalidToken ? (
				<p className="mb-4 text-center text-red-500">
					That reset link is invalid or expired. Request a new one.
				</p>
			) : null}

			<form
				className="space-y-4"
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					form.handleSubmit();
				}}
			>
				<form.Field name="email">
					{(field) => (
						<div className="space-y-2">
							<Label htmlFor={field.name}>Email</Label>
							<Input
								className="rr-mask"
								id={field.name}
								name={field.name}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								type="email"
								value={field.state.value}
							/>
							{field.state.meta.errors.map((err) => (
								<p className="text-red-500" key={err?.message}>
									{err?.message}
								</p>
							))}
						</div>
					)}
				</form.Field>

				<form.Subscribe
					selector={(state) => ({
						canSubmit: state.canSubmit,
						isSubmitting: state.isSubmitting,
					})}
				>
					{({ canSubmit, isSubmitting }) => (
						<Button
							className="w-full"
							disabled={!canSubmit || isSubmitting}
							type="submit"
						>
							{isSubmitting ? "Sending..." : "Send reset link"}
						</Button>
					)}
				</form.Subscribe>
			</form>

			<div className="mt-4 text-center">
				<Link
					className="text-indigo-600 text-sm hover:text-indigo-800"
					to="/login"
				>
					Back to sign in
				</Link>
			</div>
		</div>
	);
}

function ResetForm({ token }: { token: string }) {
	const navigate = useNavigate();

	const form = useForm({
		defaultValues: {
			password: "",
		},
		onSubmit: async ({ value }) => {
			await authClient.resetPassword(
				{
					newPassword: value.password,
					token,
				},
				{
					onError: (err) => {
						toast.error(err.error.message || err.error.statusText);
					},
					onSuccess: () => {
						track(AnalyticsEvents.auth.passwordResetCompleted);
						toast.success("Password updated, sign in with it");
						navigate({ to: "/login" });
					},
				}
			);
		},
		validators: {
			onSubmit: z.object({
				password: z.string().min(8, "Password must be at least 8 characters"),
			}),
		},
	});

	return (
		<div className="mx-auto mt-10 w-full max-w-md p-6">
			<h1 className="mb-6 text-center font-bold text-3xl">New Password</h1>

			<form
				className="space-y-4"
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					form.handleSubmit();
				}}
			>
				<form.Field name="password">
					{(field) => (
						<div className="space-y-2">
							<Label htmlFor={field.name}>New password</Label>
							<Input
								className="rr-mask"
								id={field.name}
								name={field.name}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								type="password"
								value={field.state.value}
							/>
							{field.state.meta.errors.map((err) => (
								<p className="text-red-500" key={err?.message}>
									{err?.message}
								</p>
							))}
						</div>
					)}
				</form.Field>

				<form.Subscribe
					selector={(state) => ({
						canSubmit: state.canSubmit,
						isSubmitting: state.isSubmitting,
					})}
				>
					{({ canSubmit, isSubmitting }) => (
						<Button
							className="w-full"
							disabled={!canSubmit || isSubmitting}
							type="submit"
						>
							{isSubmitting ? "Saving..." : "Set new password"}
						</Button>
					)}
				</form.Subscribe>
			</form>
		</div>
	);
}
