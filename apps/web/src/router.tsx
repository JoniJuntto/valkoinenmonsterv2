import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import type { AppRouter } from "@valkoinenmonsterv2/api/routers/index";
import { env } from "@valkoinenmonsterv2/env/web";
import { toast } from "sonner";
import { trackError } from "@/lib/analytics/track";
import Loader from "./components/loader";
import { routeTree } from "./routeTree.gen";
import { TRPCProvider } from "./utils/trpc";

function getServerUrl(url: string) {
	const normalized = url.endsWith("/") ? url.slice(0, -1) : url;

	if (!normalized.startsWith("/")) {
		return normalized;
	}

	if (typeof window !== "undefined") {
		return `${window.location.origin}${normalized}`;
	}

	const processEnv = (
		globalThis as {
			process?: { env?: Record<string, string | undefined> };
		}
	).process?.env;
	const vercelUrl =
		processEnv?.VERCEL_ENV === "production"
			? (processEnv?.VERCEL_PROJECT_PRODUCTION_URL ?? processEnv?.VERCEL_URL)
			: (processEnv?.VERCEL_URL ?? processEnv?.VERCEL_PROJECT_PRODUCTION_URL);
	if (vercelUrl) {
		const origin = vercelUrl.startsWith("http")
			? vercelUrl
			: `https://${vercelUrl}`;
		return `${origin}${normalized}`;
	}

	return `http://localhost:3000${normalized}`;
}
function createQueryClient() {
	return new QueryClient({
		defaultOptions: { queries: { staleTime: 60 * 1000 } },
		queryCache: new QueryCache({
			onError: (error, query) => {
				trackError(error, { source: "react_query" });
				toast.error(error.message, {
					action: {
						label: "retry",
						onClick: () => {
							query.invalidate();
						},
					},
				});
			},
		}),
	});
}

const trpcClient = createTRPCClient<AppRouter>({
	links: [
		httpBatchLink({
			fetch(url, options) {
				return fetch(url, {
					...options,
					credentials: "include",
				});
			},
			url: `${getServerUrl(env.VITE_SERVER_URL)}/trpc`,
		}),
	],
});

export const getRouter = () => {
	const queryClient = createQueryClient();
	const trpc = createTRPCOptionsProxy({
		client: trpcClient,
		queryClient,
	});

	const router = createTanStackRouter({
		context: { queryClient, trpc },
		defaultNotFoundComponent: () => <div>Not Found</div>,
		defaultPendingComponent: () => <Loader />,
		defaultPreloadStaleTime: 0,
		routeTree,
		scrollRestoration: true,
		Wrap: ({ children }) => (
			<TRPCProvider queryClient={queryClient} trpcClient={trpcClient}>
				{children}
			</TRPCProvider>
		),
	});

	setupRouterSsrQueryIntegration({
		queryClient,
		router,
	});

	return router;
};

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
