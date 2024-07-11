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

import * as fsUtils from "../daa-server/utils/fsUtils";
import * as path from "path";
import { animateScenario, DaaFileContent, readDaaFileContent } from "../daa-displays/utils/daa-reader";
import { DantiConnection } from "./danti-connection";
import { FPS } from "../config";
import { scenarios } from "../scenarios";

// get args from command line
const argv: string[] = process.argv?.slice(2) || [];
console.log('argv: ', argv);

// loop forever
const loop: boolean = argv?.includes("-loop") || argv?.includes("loop");
if (loop) { console.log(">> Loop = true <<"); }

// whether additional frames should be introduced to create a smoother simulation
// the added frames are marked with a flag "animation-frame" so we can recognize these additional frames in the case we want to handle them differently
const animate: boolean = argv.includes("animate");

// simulation speed, e.g., 1 (real-time), 2 (fast-time), 0.5 (slow-time)
// slow-time is useful for slow machine that are unable to keep up with the rendering
const speed: number = 
    argv.includes("speed") && (argv.indexOf("speed") + 1 < argv.length) ? 
        parseFloat(argv.slice(argv.indexOf("speed") + 1)[0]) 
        : 1;

// target frames per seconds of the simulation
const fps: number = animate ? FPS : 1;

// frequency of periodic send
const interval: number = 1000 / speed; //ms

// get filename from the arguments
const baseFolder: string = "../daa-scenarios";
let scenarioNames: string[] = argv.filter(elem => { return elem.endsWith(".daa") || scenarios[elem]; });
scenarioNames = scenarioNames?.length > 0 ? scenarioNames : [ scenarios["centennial-accident"] ];
const fileName: string = scenarios[scenarioNames[0]] || scenarioNames[0];
console.log(scenarioNames);
const fname: string = path.join(__dirname, baseFolder, fileName);

// utility function, opens a file and sends the content to danti
const playFile = async (fname: string, opt?: { loop?: boolean }) => {
    opt = opt || {};
    console.log(`[stream-scenario2danti] opening file ${fileName}`)
    const fileContent: string = await fsUtils.readFile(fname);
    console.log(`[stream-scenario2danti] reading daa file content (${fname})`);
    const simulation_series: DaaFileContent = readDaaFileContent(fileContent, { computeRoll: true });

    // dump content of the generated json files, useful for debugging
    const outfile: string = path.join(__dirname, baseFolder, `${fileName}.json`);
    console.log(`[stream-scenario2xplane] writing ${outfile}`);
    fsUtils.writeFile(outfile, JSON.stringify(simulation_series, null, " "));    
    const animated_series: DaaFileContent = animate ? animateScenario(simulation_series, fps) : null;

    if (simulation_series?.steps) {
        if (animate) {
            const animated_file: string = path.join(__dirname, baseFolder, `${fileName}.anim.json`);
            fsUtils.writeFile(animated_file, JSON.stringify(animated_series, null, " "));
        }

        // playback the animated series
        const selected_series: DaaFileContent = animate ? animated_series : simulation_series;
        const stats: string = `
---------------------------------------------
 scenario: ${fileName}
 steps: ${selected_series?.steps}
 step size: ${selected_series?.stepSize}s
 simulation interval: ${interval}ms
 simulation speed: ${speed}x
 target frame rate: ${fps}fps
 loop: ${loop}
---------------------------------------------`;
        console.log(`[stream-scenario2danti] starting simulation`);
        console.log(stats);
        console.log("use Ctrl+C to stop the simulation")
        // create data streamer instance
        const danti: DantiConnection = new DantiConnection();
        // activate connection (this will reset the state of the display)
        await danti.activate();
        // start playback
        const ownshipName: string = selected_series.ownship[0].name;
        console.log(`[stream-scenario2danti] Ownship name: ${ownshipName}`);
		// start playback
        danti.play({ ...selected_series.daa, ownshipName }, {
            interval, stats, ...opt
        });
    } else {
        console.warn(`[stream-scenario2xplane] Warning: empty .daa file or unable to read file ${fname}`)
    }
}

// load file
playFile(fname, { loop });
