export const shouldTransferAnonymousSave = (
	anonymousLifetimeCans: number,
	registeredLifetimeCans?: number
): boolean =>
	registeredLifetimeCans === undefined ||
	anonymousLifetimeCans > registeredLifetimeCans;
