import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { createMiddleware } from "@tanstack/react-start";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import type { AppRouter } from "@valkoinenmonsterv2/api/routers/index";
import { Toaster } from "@valkoinenmonsterv2/ui/components/sonner";
import { evlogErrorHandler } from "evlog/nitro/v3";
import { ThemeProvider } from "next-themes";

import Header from "../components/header";
import { RybbitIdentify } from "../components/rybbit-identify";
import { RybbitProvider } from "../components/rybbit-provider";

import appCss from "../index.css?url";
export interface RouterAppContext {
	queryClient: QueryClient;
	trpc: TRPCOptionsProxy<AppRouter>;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
	component: RootDocument,

	head: () => ({
		links: [
			{
				href: appCss,
				rel: "stylesheet",
			},
			{
				href: "/valkoinenmonster.webp",
				rel: "icon",
				type: "image/webp",
			},
		],
		meta: [
			{
				charSet: "utf-8",
			},
			{
				content: "width=device-width, initial-scale=1",
				name: "viewport",
			},
			{
				title: "Valkoinen Monster Clicker",
			},
		],
		scripts: [
			{
				"data-site-id": "c7b355329e37",
				defer: true,
				src: "https://analytics.huikaton.online/api/script.js",
			},
		],
	}),
	server: {
		middleware: [createMiddleware().server(evlogErrorHandler)],
	},
});

function RootDocument() {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body>
				<RybbitProvider />
				<RybbitIdentify />
				<ThemeProvider
					attribute="class"
					defaultTheme="light"
					disableTransitionOnChange
				>
					<div className="grid h-svh grid-rows-[auto_1fr]">
						<Header />
						<Outlet />
					</div>
					<Toaster richColors />
				</ThemeProvider>
				<TanStackRouterDevtools position="bottom-left" />
				<ReactQueryDevtools buttonPosition="bottom-right" position="bottom" />
				<Scripts />
			</body>
		</html>
	);
}
