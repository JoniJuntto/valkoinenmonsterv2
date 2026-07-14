export function bucketCans(value: number): string {
	if (value < 100) {
		return "0-99";
	}
	if (value < 1000) {
		return "100-999";
	}
	if (value < 10_000) {
		return "1k-9k";
	}
	if (value < 100_000) {
		return "10k-99k";
	}
	if (value < 1_000_000) {
		return "100k-999k";
	}
	if (value < 10_000_000) {
		return "1m-9m";
	}
	return "10m+";
}

export function bucketCps(value: number): string {
	if (value < 1) {
		return "0-0";
	}
	if (value < 10) {
		return "1-9";
	}
	if (value < 100) {
		return "10-99";
	}
	if (value < 1000) {
		return "100-999";
	}
	return "1000+";
}

export function bucketElapsedMs(ms: number): string {
	if (ms < 60_000) {
		return "under_1m";
	}
	if (ms < 300_000) {
		return "1m-5m";
	}
	if (ms < 3_600_000) {
		return "5m-1h";
	}
	return "1h+";
}
