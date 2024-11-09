/**
 * @author: Paolo Masci
 * @date: 2022.02.05
 * 
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

import { ChildProcess, spawn } from "child_process";
import * as path from 'path';
import { DaaAircraft, DaaTraffic, DEFAULT_LABELS, DEFAULT_UNITS } from "../../daa-displays/utils/daa-reader";

/**
 * JSON data returned by getXPlaneData
 * {
 *      ownship: { 
 *          name: string,
 *          lat: { val: string, units: string },
 *          lon: { val: string, units: string },
 *          alt: { val: string, units: string },
 *          heading: { val: string, units: string },
 *          vspeed: { val: string, units: string },
 *          airspeed: { val: string, units: string }
 *      },
 *      traffic: [
 *          {
 *              name: string,
 *              lat: { val: string, units: string },
 *              lon: { val: string, units: string },
 *              alt: { val: string, units: string },
 *              heading: { val: string, units: string },
 *              vspeed: { val: string, units: string },
 *              airspeedspeed: { val: string, units: string } 
 *          } 
 *          ... (one entry for each traffic aircraft, xplane 11 supports 20 aircraft max)
 *      ]
 * }
 */
export interface XPlaneAircraft { 
    name: string,
    lat: { val: string, units: string },
    lon: { val: string, units: string },
    alt: { val: string, units: string },
    heading: { val: string, units: string },
    vspeed: { val: string, units: string },
    airspeed: { val: string, units: string },
    time?: string,
    error?: string // true indicates that an error occurred while reading the aircraft state
}
export interface XPlaneData {
    ownship: XPlaneAircraft
    traffic?: XPlaneAircraft[],
    time?: string,
    error?: string,
    danti?: string,
    shutdown?: string // shutdown command, the value is the ID of the danti instance that we want to kill
}

/**
 * Relevant dref keys used in xplane connection
 */
export type XPlaneKey = "sim/flightmodel/position/latitude" | "sim/flightmodel/position/longitude"
 | "sim/flightmodel/position/elevation" | "sim/flightmodel/position/psi" 
 | "sim/flightmodel/position/groundspeed" | "sim/flightmodel/position/indicated_airspeed"
 | "sim/flightmodel/position/indicated_airspeed2" | "sim/flightmodel/position/true_airspeed"
 | "sim/flightmodel/position/vh_ind" | "sim/flightmodel/position/vh_ind_fpm" 
 | "sim/flightmodel/position/vh_ind_fpm2";

/**
 * Creates a connection with XPlane and provides utility functions to print data in the format accepted by DANTi  
 */
export class XPlaneConnection {
    // reference clock
    clock: number = 0;

    /**
     * get data from xplane
     * opt.replay whether this is a scenario replay
     */
    async getXPlaneData (opt?: { replay?: boolean }): Promise<XPlaneData> {
        // console.log("[getXPlaneData]", opt);
        const worker: JavaProcessWorker = new JavaProcessWorker();
        const ans: string = opt?.replay ?
            await worker.exec(`${__dirname}/dist/XPlaneConnectionReplay.jar`)
                : await worker.exec(`${__dirname}/dist/XPlaneConnection.jar`);
        this.clock++;
        // console.log(`[xplane-connect] Received xplane data: `, ans);
		try {
	    	return ans ? JSON.parse(ans) : null;
		} catch (err) {
			return null;
		}
    }
    /**
     * prints aircraft data in the daa format.
     * An example data in the daa format is as follows
     * N416DJ, 39.618208672764, -104.89621335902606, 7016.67, 33.00, 148.00, -500.00, 63
     * where the columns are:
     * NAME     lat          lon           alt          trk         gs           vs         time
     * [none]   [deg]        [deg]         [ft]         [deg]       [knot]       [fpm]      [s]
     */
    printDaaAircraft (data: XPlaneData, ac: number, opt?: { useClock?: boolean, useMillis?: boolean }): string {
        const ac_index: number = ac === 0 ? 0 : ac - 1;
        const aircraft: XPlaneAircraft = ac === 0 ? 
            data?.ownship 
            : ac_index < data?.traffic?.length ? data?.traffic[ac_index] 
            : null;
        const name: string = aircraft?.name || (ac === 0 ? "--" : `AC${ac}`);        
        const lat: string = aircraft?.lat?.val || "0"; // deg
        const lon: string = aircraft?.lon?.val || "0"; // deg
        const alt: string = aircraft?.alt?.val || "0"; // ft
        
        const heading: string = aircraft?.heading?.val || "0"; // deg
        const airspeed: string = aircraft?.airspeed?.val || "0"; // knot
        const vspeed: string = aircraft?.vspeed?.val || "0"; // fpm
        let time: string = opt?.useClock ? `${this.clock}`
            : aircraft?.time || data?.time || `${this.clock}`;
        if (opt?.useMillis) {
            // time is in milliseconds, we need to divide be 1000 to have seconds
            time = `${+time / 1000}`;
        }
        const dantiData: string = [
            name, 
            lat, lon, alt,
            heading, airspeed, vspeed,
            time
        ].join(",");
        return dantiData;
    }
    /**
     * extracts traffic data from the given xplane data
     * traffic data is formatted in the daa format.
     * An example data in the daa format is as follows
     * N416DJ, 39.618208672764, -104.89621335902606, 7016.67, 33.00, 148.00, -500.00, 63
     * where the columns are:
     * NAME     lat          lon           alt          trk         gs           vs         time
     * [none]   [deg]        [deg]         [ft]         [deg]       [knot]       [fpm]      [s]
     */
    printDaaTraffic (data: XPlaneData, opt?: { useClock?: boolean, useMillis?: boolean }): string[] {
        const traffic: XPlaneAircraft[] = data.traffic;
        const ans: string[] = [];
        for (let i = 0; i < traffic?.length; i++) {
            const acData: string = this.printDaaAircraft(data, i + 1, opt);
            ans.push(acData);
        }
        return ans;
    }
    /**
     * prints labels used in the danti format
     */
    printLabels (): string {
        return DEFAULT_LABELS;
    }
    /**
     * prints units used in the danti format
     */
    printUnits (): string {
        return DEFAULT_UNITS;
    }
    /**
     * Utility function, advanced the clock
     */
    advanceClock (): void {
        this.clock++;
    }
    /**
     * sends daa data to xplane, to set position, heading, speed of ownship (1st aircraft) and traffic aircraft
     * name (name of the aircraft)
     * lat [deg] 
     * lon [deg] 
     * alt [ft]
     */
    async daa (ownship: DaaAircraft, traffic: DaaTraffic): Promise<boolean> {
        if (ownship) {
            const worker: JavaProcessWorker = new JavaProcessWorker();
            let args: string = `${ownship.name}, ${ownship.lat}, ${ownship.lon}, ${ownship.alt},`
                + ` ${ownship.trk || 0}, ${ownship.roll || 0}, ${ownship.gs || 0}, ${ownship.vs || 0}`;
            for (let i = 0; i < traffic?.length; i++) {
                if (traffic[i]?.name) { // this extra check is needed because info for some ac may not be provided for certain time instants (and in that case traffic[i] is null)
                    args += `, ${traffic[i].name}, ${traffic[i].lat}, ${traffic[i].lon}, ${traffic[i].alt},`
                        + ` ${traffic[i].trk || 0}, ${traffic[i].roll || 0}, ${traffic[i].gs || 0}, ${traffic[i].vs || 0}`;
                }
            }
            console.log(`[xplane-connection] time=${ownship.time}s\n     daa(${args})`);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const ans: string = await worker.exec(`${__dirname}/dist/XPlaneConnection.jar`, [ "-daa", args ]);
            return true;    
        }
        return false;
    }
    /**
     * sets ownship position and heading
     * lat [deg] 
     * lon [deg] 
     * alt [ft]
     * heading [deg]
     */
    async setPosition (ownship: {
        name: string,
        lat: number | string, 
        lon: number | string, 
        alt: number | string, 
        heading?: number | string
    }): Promise<boolean> {
        if (ownship) {
            const worker: JavaProcessWorker = new JavaProcessWorker();
            const args: string = `${ownship.name}, ${ownship.lat}, ${ownship.lon}, ${ownship.alt}, ${ownship.heading || 0}`;
            // console.log(`[xplane-connection] setPosition(${args})`);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const ans: string = await worker.exec(`${__dirname}/dist/XPlaneConnection.jar`, [ "-setPosition", args ]);
            return true;
        }
        return false;
    }
    /**
     * sets position and heading of traffic aircraft
     * name (name of the aircraft)
     * lat [deg] 
     * lon [deg] 
     * alt [ft]
     */
    async setTrafficPosition (traffic: {
        name: string,
        lat: number | string, 
        lon: number | string, 
        alt: number | string,
        heading?: number | string
    }[]): Promise<boolean> {
        if (traffic?.length) {
            const worker: JavaProcessWorker = new JavaProcessWorker();
            let args: string = `${traffic[0].name}, ${traffic[0].lat}, ${traffic[0].lon}, ${traffic[0].alt}, ${traffic[0].heading || 0}`;
            for (let i = 1; i < traffic.length; i++) {
                args += `, ${traffic[i].name}, ${traffic[i].lat}, ${traffic[i].lon}, ${traffic[i].alt}, ${traffic[i].heading || 0}`;
            }
            // console.log(`[xplane-connection] setTrafficPosition(${args})`);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const ans: string = await worker.exec(`${__dirname}/dist/XPlaneConnection.jar`, [ "-setTrafficPosition", args ]);
            return true;    
        }
        return false;
    }
    /**
     * sets speed of traffic aircraft
     * airspeed [knot] 
     * vspeed [fpm] 
     */
    async setTrafficSpeed (traffic: {
        airspeed?: number | string,
        vspeed?: number | string
    }[]): Promise<boolean> {
        if (traffic?.length) {
            const worker: JavaProcessWorker = new JavaProcessWorker();
            let args: string = `${traffic[0].airspeed || 0}, ${traffic[0].vspeed || 0}`;
            for (let i = 1; i < traffic.length; i++) {
                args += `, ${traffic[i].airspeed || 0}, ${traffic[i].vspeed || 0}`;
            }
            // console.log(`[xplane-connection] setTrafficSpeed(${args})`);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const ans: string = await worker.exec(`${__dirname}/dist/XPlaneConnection.jar`, [ "-setTrafficSpeed", args ]);
            return true;    
        }
        return false;
    }
    /**
     * send airspeed and vspeed
     * airspeed [knot] 
     * vspeed []
     */
    async setSpeed (
        airspeed: number | string,
        vspeed: number | string
    ): Promise<boolean> {
        const worker: JavaProcessWorker = new JavaProcessWorker();
        const args: string = `${airspeed || 0}, ${vspeed || 0}`;
        // console.log(`[xplane-connection] setSpeed(${args})`);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const ans: string = await worker.exec(`${__dirname}/dist/XPlaneConnection.jar`, [ "-setSpeed", args ]);
        return true;
    }
    /**
     * Set scenery on a different planet
     */
    async setPlanet (planet: "mars" | "earth"): Promise<boolean> {
        const worker: JavaProcessWorker = new JavaProcessWorker();
        const args: string[] = planet === "mars" ? [ "-setPlanetMars" ] : [ "-setPlanetEarth" ]
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const ans: string = await worker.exec(`${__dirname}/dist/XPlaneConnection.jar`, args);
        return true;
    }
    /**
     * Disable xplane physics engine
     */
    async disablePhysicsEngine (): Promise<boolean> {
        const worker: JavaProcessWorker = new JavaProcessWorker();
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const ans: string = await worker.exec(`${__dirname}/dist/XPlaneConnection.jar`, [ "-disablePhysicsEngine" ]);
        return true;
    }
    /**
     * Disable xplane physics engine
     */
    async enablePhysicsEngine (): Promise<boolean> {
        const worker: JavaProcessWorker = new JavaProcessWorker();
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const ans: string = await worker.exec(`${__dirname}/dist/XPlaneConnection.jar`, [ "-enablePhysicsEngine" ]);
        return true;
    }
    /**
     * Pause simulation
     */
    async pauseSimulation (): Promise<boolean> {
        const worker: JavaProcessWorker = new JavaProcessWorker();
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const ans: string = await worker.exec(`${__dirname}/dist/XPlaneConnection.jar`, [ "-pauseSim" ]);
        return true;
    }
//     /**
//      * Utility function, returns the value of xplane data
//      */
//     getVal (data: XPlaneData, key: XPlaneKey): string {
//         return data && key ? data[key]?.val : null;
//     }
//     /**
//      * Utility function, returns the units of xplane data
//      */
//     getUnits (data: XPlaneData, key: XPlaneKey): string {
//         return data && key ? data[key]?.units : null;
//     }
}

/**
 * Utility class for running java processes and shell scripts
 */
export class JavaProcessWorker {
    // whether the child process is ready
    protected child_process_ready: boolean = false;

    /**
     * List of process workers
     */
    protected workers: { [ fname: string ]: ChildProcess } = {};

    /**
     * Executes a process worker and then kills it
     */
    async exec (fname: string, args?: string[]): Promise<string> {
        const ans: string = await this.run(fname, { args });
        this.kill(fname);
        return ans;
    }

    /**
     * Spawns a new java process
     * - fname is the executable to be spawned by the process
     * - opt.args are the arguments to be passed to the executable
     * - opt.bash is the path to a bash shell (e.g., used in windows systems that need to execute bash script with cygwin)
     * - opt.cb is the callback function to be invoked when data is received
     * - opt.cwd is the path where the process will be executed
     */
    async run (fname: string, opt?: {
        args?: string[], 
        bash?: string, 
        cb?: (data: string) => void,
        cwd?: string,
        waitReady?: boolean
    }): Promise<string> {
        if (fname) {
            let args: string[] = opt?.args || [];
            return new Promise((resolve) => {
                // const cmd: string = `java ${args.concat(fname).join(" ")}`;
                // console.log(cmd);
                // const res: Buffer = execSync(cmd);
                // console.log(res.toLocaleString());
                args = 
                    opt?.bash ? [ fname ].concat(args)
                    : fname.endsWith(".jar") ? [ "-jar", fname ].concat(args)
                    : args;
                // console.log(`[xplane-connect] worker: java, args: [ ${args.join(", ")} ]`);
                fname = path.resolve(fname);
                const processName: string = opt?.bash ? opt.bash
                    : fname.endsWith(".jar") ? "java" 
                    : fname;
                if (opt?.cwd) { console.log(`[xplane-connection] executing: cd ${opt.cwd}`); }
                console.log(`[xplane-connection] executing: ${processName} ${args.join(" ")}`);
				try {
					const worker: ChildProcess = spawn(processName, args, { cwd: opt?.cwd || "" });
					this.workers[fname] = worker;
					worker.stdout.setEncoding("utf8");
					worker.stderr.setEncoding("utf8");
					worker.stdout.on("data", (data: string) => {
						if (!opt?.waitReady || (data && !this.child_process_ready && /\bready\b/gi.test(data))) {
							this.child_process_ready = true;
							resolve(data);
						}
						if (opt?.cb && typeof opt?.cb === "function") {
							opt?.cb(data);
						}
					});
					worker.stderr.on("data", (data: string) => {
						console.error(data);
						// resolve(false);
					});
					worker.on("spawn", () => {
						console.error("[process-worker] Process spawned successfully!");
					});
					worker.on("error", (err: Error) => {
						console.error("[process-worker] Process error ", err);
						// console.dir(err, { depth: null });
					});
					// eslint-disable-next-line @typescript-eslint/no-unused-vars
					worker.on("exit", (code: number, signal: string) => {
						// console.log("[pvs-parser] Process exited with code ", code);
						// file parsed successfully
						resolve(null);
						// console.dir({ code, signal });
					});
					worker.on("message", (message) => {
						console.log("[process-worker] Process message", message);
						// console.dir(message, { depth: null });
					});
				} catch (err) {
					console.error(`[process-worker] Error while spawning ${processName} ${args.join(" ")}`, err);
				}
            });
        }
        return null;
    }

    /**
     * kills a process worker
     */
    kill (fname: string): void {
        if (fname && this.workers && this.workers[fname]) {
            this.workers[fname].kill();
        }
    }
}
