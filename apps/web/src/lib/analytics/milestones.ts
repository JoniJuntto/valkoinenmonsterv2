const CLICK_MILESTONES = [
	1, 10, 100, 1000, 10_000, 100_000, 1_000_000,
] as const;

export type ClickMilestone = (typeof CLICK_MILESTONES)[number];

export function getClickMilestone(totalClicks: number): ClickMilestone | null {
	for (let index = CLICK_MILESTONES.length - 1; index >= 0; index -= 1) {
		const milestone = CLICK_MILESTONES[index];
		if (milestone !== undefined && totalClicks === milestone) {
			return milestone;
		}
	}
	return null;
}
