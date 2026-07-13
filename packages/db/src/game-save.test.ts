import { expect, test } from "bun:test";

import { shouldTransferAnonymousSave } from "./game-save";

test("keeps the higher lifetime save and breaks ties for the registered account", () => {
	expect(shouldTransferAnonymousSave(10)).toBe(true);
	expect(shouldTransferAnonymousSave(11, 10)).toBe(true);
	expect(shouldTransferAnonymousSave(10, 10)).toBe(false);
	expect(shouldTransferAnonymousSave(9, 10)).toBe(false);
});
