/**
 * ## Notices
 * Copyright 2019 United States Government as represented by the Administrator 
 * of the National Aeronautics and Space Administration. All Rights Reserved.
 * 
 * ## Disclaimers
 * No Warranty: THE SUBJECT SOFTWARE IS PROVIDED "AS IS" WITHOUT ANY WARRANTY OF ANY KIND, 
 * EITHER EXPRESSED, IMPLIED, OR STATUTORY, INCLUDING, BUT NOT LIMITED TO, ANY WARRANTY 
 * THAT THE SUBJECT SOFTWARE WILL CONFORM TO SPECIFICATIONS, ANY IMPLIED WARRANTIES OF 
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR FREEDOM FROM INFRINGEMENT, 
 * ANY WARRANTY THAT THE SUBJECT SOFTWARE WILL BE ERROR FREE, OR ANY WARRANTY THAT 
 * DOCUMENTATION, IF PROVIDED, WILL CONFORM TO THE SUBJECT SOFTWARE. THIS AGREEMENT DOES NOT, 
 * IN ANY MANNER, CONSTITUTE AN ENDORSEMENT BY GOVERNMENT AGENCY OR ANY PRIOR RECIPIENT 
 * OF ANY RESULTS, RESULTING DESIGNS, HARDWARE, SOFTWARE PRODUCTS OR ANY OTHER APPLICATIONS 
 * RESULTING FROM USE OF THE SUBJECT SOFTWARE.  FURTHER, GOVERNMENT AGENCY DISCLAIMS 
 * ALL WARRANTIES AND LIABILITIES REGARDING THIRD-PARTY SOFTWARE, IF PRESENT IN THE 
 * ORIGINAL SOFTWARE, AND DISTRIBUTES IT "AS IS."
 * 
 * Waiver and Indemnity:  RECIPIENT AGREES TO WAIVE ANY AND ALL CLAIMS AGAINST THE 
 * UNITED STATES GOVERNMENT, ITS CONTRACTORS AND SUBCONTRACTORS, AS WELL AS ANY PRIOR 
 * RECIPIENT.  IF RECIPIENT'S USE OF THE SUBJECT SOFTWARE RESULTS IN ANY LIABILITIES, 
 * DEMANDS, DAMAGES, EXPENSES OR LOSSES ARISING FROM SUCH USE, INCLUDING ANY DAMAGES 
 * FROM PRODUCTS BASED ON, OR RESULTING FROM, RECIPIENT'S USE OF THE SUBJECT SOFTWARE, 
 * RECIPIENT SHALL INDEMNIFY AND HOLD HARMLESS THE UNITED STATES GOVERNMENT, 
 * ITS CONTRACTORS AND SUBCONTRACTORS, AS WELL AS ANY PRIOR RECIPIENT, TO THE EXTENT 
 * PERMITTED BY LAW.  RECIPIENT'S SOLE REMEDY FOR ANY SUCH MATTER SHALL BE THE IMMEDIATE, 
 * UNILATERAL TERMINATION OF THIS AGREEMENT.
 */

/**
 * This is Electron's entry point (see 'start' script in package.json)
 */
import { app, BrowserWindow, screen } from "electron";
import { FULLSCREEN, MARGIN_LEFT, MARGIN_TOP, MAXIMIZED, TOUGHPAD, WINDOW_RESIZE_DELAY } from "./config";
import * as path from "path";

// supported args are: frameless
const argv: string[] = process.argv?.slice(2);
console.log("[main] argv: ", argv);

// whether the danti window should be frameless
// when danti is frameless, the top bar for moving the window is not present
// however, there's a workaround: danti will be always attached to 0,0 in the window position
// and we can use the fact that danti is always in position 0,0 to move the position of danti 
const frameless: boolean = argv?.includes("frameless");

export type size = { height: number, width: number };
app.commandLine.appendSwitch('enable-experimental-web-platform-features');

// themes
enum themes { 
	NONE,
	TOUGHPAD  // a picture of a toughpad is used as frame for the DANTi display 
}
const selectedTheme: themes = themes.TOUGHPAD;

// electron window size
const getSize = (theme: themes) => {
	switch (theme) {
		case themes.TOUGHPAD: {
			const SCALE: number = 0.56 * 1.7; // this should be identical to the products of the scale factors indicated in <body> and <daa-theme> of toughpad.html
			const imageSize: size = frameless ? { width: 980, height: 670 } : { width: 980, height: 700 };
			return { width: imageSize.width * SCALE, height: imageSize.height * SCALE };
		}
		case themes.NONE:
		default: {
			const SCALE: number = 0.8; // this should be identical to the scale factor indicated in <body> of index.html
			const daaDisplaysSize: size = { width: 1054, height: 842 };
			return { width: daaDisplaysSize.width * SCALE, height: daaDisplaysSize.height * SCALE };
		}
	}
};

// default size of the window bar
const WINDOW_BAR_SIZE: number = 28;
// default size of h-padding
const HORIZ_PADDING: number = 10;

// default size of the danti display
const SIZE: size = TOUGHPAD ? { width: 1920, height: 1200 } : getSize(selectedTheme);

const createWindow = (): void => {
	const displays = screen.getAllDisplays();
	console.log(`${displays?.length} displays detected`, displays);
	// Create the browser window.
	const width: number = Math.ceil(SIZE.width + HORIZ_PADDING);
	const height: number = Math.ceil(SIZE.height + WINDOW_BAR_SIZE);
	const backend: string = path.join(__dirname, "backend.js");
	console.log(`preloading backend ${backend}`);
	// see APIs at https://www.electronjs.org/docs/latest/api/browser-window
	const opt = {
		center: true,
		webPreferences: {
			preload: backend,
			experimentalFeatures: true,
			sandbox: false // Disabling sandbox for the DANTi app because from Electron 20 onwards, preload scripts are sandboxed by default and no longer have access to a full Node.js environment, see also https://www.electronjs.org/docs/latest/tutorial/sandbox#disabling-the-sandbox-for-a-single-process
		},
		width,
		height,
		alwaysOnTop: frameless,
		frame: !frameless && !TOUGHPAD,
		resizable: !TOUGHPAD
	};
	console.log(opt);
	const win = new BrowserWindow(opt);

	// and load the index.html of the app.
	win.loadFile("index.html");

	// set window position
	win.setPosition(MARGIN_LEFT, MARGIN_TOP);

	// maximize to fullscreen if needed
	if (FULLSCREEN || MAXIMIZED) {
		setTimeout(() => {
			// set full screen or maximized
			FULLSCREEN ? win.setFullScreen(true) : win.maximize();
			// move window to the top
			win.moveTop();
		}, WINDOW_RESIZE_DELAY);
	} else {
		// move window to the top
		win.moveTop();
	}

	// Open the DevTools for debugging purposes
	// if (DBG) { win.webContents.openDevTools(); }
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
	createWindow();
	app.on("activate", () => {
		// On macOS it's common to re-create a window in the app when the
		// dock icon is clicked and there are no other windows open.
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	});
});

// kill the app when all windows are closed
app.on("window-all-closed", () => {
	console.log("[main] shutting down DANTi")
	app.quit();
});
// close the window when the rendering process is killed
app.on("render-process-gone", (event: Event, webContents, details: { reason: string, exitCode: number }) => {
	console.log("[main] shutting down DANTi");
	console.dir(details, { depth: null });
	app.quit();
});