import { BrowserWindow, Updater } from "electrobun/bun";

const DEV_SERVER_PORT = 3001;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

async function getMainViewUrl(): Promise<string> {
	const channel = await Updater.localInfo.channel();
	if (channel === "dev") {
		try {
			await fetch(DEV_SERVER_URL, { method: "HEAD" });
			console.log(`HMR enabled: Using web dev server at ${DEV_SERVER_URL}`);
			return DEV_SERVER_URL;
		} catch {
			console.log("Web dev server not running. Run dev:hmr for live reload.");
		}
	}

	return "views://mainview/index.html";
}

const url = await getMainViewUrl();

new BrowserWindow({
	frame: {
		height: 820,
		width: 1280,
		x: 120,
		y: 120,
	},
	title: "valkoinenmonsterv2",
	url,
});

console.log("Electrobun desktop shell started.");
