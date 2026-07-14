import { useEffect, useRef } from "react";

import { identifyUser, setUserTraits } from "@/lib/analytics/track";
import { authClient } from "@/lib/auth-client";

interface RybbitIdentifyProps {
	prestigeLevel?: number;
}

export function RybbitIdentify({ prestigeLevel }: RybbitIdentifyProps) {
	const { data: session } = authClient.useSession();
	const lastUserIdRef = useRef<string | null>(null);

	useEffect(() => {
		if (!session?.user) {
			return;
		}

		const userId = session.user.id;
		const isAnonymous = Boolean(session.user.isAnonymous);

		if (lastUserIdRef.current !== userId) {
			identifyUser(userId, { is_anonymous: isAnonymous });
			lastUserIdRef.current = userId;
		}
	}, [session?.user]);

	useEffect(() => {
		if (prestigeLevel === undefined || !session?.user) {
			return;
		}
		setUserTraits({ prestige_level: prestigeLevel });
	}, [prestigeLevel, session?.user]);

	return null;
}
