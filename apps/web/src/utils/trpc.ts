import { createTRPCContext } from "@trpc/tanstack-react-query";
import type { AppRouter } from "@valkoinenmonsterv2/api/routers/index";

export const { TRPCProvider, useTRPC, useTRPCClient } =
	createTRPCContext<AppRouter>();
