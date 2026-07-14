interface RybbitClient {
	clearUserId: () => void;
	error: (
		error: Error | ErrorEvent,
		context?: Record<string, string | number | boolean>
	) => void;
	event: (
		name: string,
		properties?: Record<string, string | number | boolean>
	) => void;
	identify: (
		userId: string,
		traits?: Record<string, string | number | boolean>
	) => void;
	pageview: (path?: string) => void;
	setTraits: (traits: Record<string, string | number | boolean>) => void;
}

declare global {
	interface Window {
		rybbit?: RybbitClient;
	}
}

export {};
