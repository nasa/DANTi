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

import { ChildProcess, spawn } from "child_process";
import path = require("path");
import { DantiWorkerInterface } from "./danti-interface";
import * as fsUtils from '../daa-server/utils/fsUtils';
import * as os from 'os';

/**
 * Process worker for computing daa bands
 */
export class DantiWorker implements DantiWorkerInterface {
    /**
     * Regex for detecting ready prompt of the process
     */
    protected readyPrompt: RegExp = /\s>>\s/g;
    /**
	 * Process worker for computing bands
	 */
	protected worker: ChildProcess;
    /**
     * Buffer for sending messages to the worker
     */
    protected buffer: Promise<string> = Promise.resolve("");
    /**
     * Callback function invoked by the worker when the process provides a response
     */
    protected cb: (data: string) => void;
    /**
     * ready flag, indicates that the worker is ready
     */
    protected ready: boolean = false;
    /**
     * output data produced by the worker
     */
    protected data: string = "";
    /**
     * debug flag, when true the worker prints debug messages
     */
    protected dgb: boolean = false;
    
    /**
     * Activates the worker
     */
    activate (opt?: { verbose?: boolean }): Promise<boolean> {
        this.dgb = !!opt?.verbose;
        return new Promise ((resolve) => {
            this.log("[danti-worker] Booting up bands worker...");
            const dir: string = path.join(__dirname, "../danti-utils"); // folder containing DAABandsREPLV2
            const args: string[] = [
                "-jar", path.join(dir, "DAABandsREPLV2.jar")
            ];
            this.worker = spawn("java", args);
            this.worker.stdout.setEncoding("utf8");
            this.worker.stderr.setEncoding("utf8");
            this.worker.stdout.on("data", async (data: string) => {
                this.ready = false;
                this.data += data;
                this.log(this.data);
                const matchReadyPrompt: RegExpMatchArray = new RegExp(this.readyPrompt).exec(data);
                if (matchReadyPrompt) {
                    if (!this.ready) {
                        this.ready = true;
                        this.data = "";
                        // this.log("[danti-worker] danti-worker ready!");
                        resolve(true);
                    }
                    if (this.cb && typeof this.cb === "function") {
                        const res: string = this.data.replace(this.readyPrompt, "");
                        this.cb(res.trim());
                    }
                }
            });
            this.worker.stderr.on("data", (data: string) => {
                this.log(data);
                // const msg: string = data?.replace(/#.*/g, "");
                // (msg) ? this.error(data) : this.log(data);
            });
            this.worker.on("error", (err: Error) => {
                this.error("[danti-worker] Process error", err);
            });
            this.worker.on("exit", (code: number, signal: string) => {
                this.warn("[danti-worker] Process exited", { code, signal });
            });
            this.worker.on("message", (message: string) => {
                this.info("[danti-worker] " + message);
            });
        });
	}
    /**
     * Sends a command to bands worker
     */
    async sendText(cmd: string, data?: string): Promise<string> {
        this.buffer = this.buffer.then(() => {
            return new Promise((resolve) => {
                // resolve the promise when the process completes the execution
                this.cb = (data: string) => {
                    resolve(data);
                };
                // reset data
                this.data = "";
                // send command and args to the process
                const args: string = data ? `${data.replace(/\n/g, "")}\n` : "\n";
                this.worker?.stdin?.write(`${cmd} ${args}`);
                this.log(`${cmd} ${args}`);
            });
        });
        return this.buffer;
    }
    /**
     * Sends reset to the worker -- this is used to re-initialize all data structures
     */
    async reset (): Promise<string> {
        return await this.sendText("reset");
    }
    /**
     * Sends traffic data to the worker
     */
    async trafficData (data: string): Promise<string> {
        return await this.sendText("traffic", data);
    }
    /**
     * Sends ownship data to the worker
     */
    async ownshipData(data: string): Promise<string> {
        return await this.sendText("ownship", data);
    }
    /**
     * Sends ownship name to the worker
     */
    async ownshipName(data: string): Promise<string> {
        return await this.sendText("ownship-name", data);
    }
    /**
     * Sends daa labels data to the worker
     */
    async labels(data: string): Promise<string> {
        return await this.sendText("labels", data);
    }
    /**
     * Sends daa units to the worker
     */
    async units(data: string): Promise<string> {
        return await this.sendText("units", data);
    }
    /**
     * Sends wind data to the worker
     */
    async wind(data: string): Promise<string> {
        return await this.sendText("wind", data);
    }
    /**
     * Sets the location of the daa config folder
     */
    async configFolder(data: string): Promise<string> {
        return await this.sendText("configFolder", data);
    }
    /**
     * Selects a daa configuration
     */
    async config(data: string): Promise<string> {
        return await this.sendText("config", data);
    }
    /**
     * Sends compute-bands request to the worker
     */
     async computeBands(): Promise<{ bands: string, lla: string }> {
        await this.sendText("compute-bands");
        const tmpDir: string = os.tmpdir();
        const bandsFile: string = path.join(tmpDir, "REPL.json");
        const bands: string = await fsUtils.readFile(bandsFile);
        const llaFile: string = path.join(tmpDir, "REPL-scenario.json");
        const lla: string = await fsUtils.readFile(llaFile);
        return { bands, lla };
    }
    /**
     * Utility functions for logging data
     */
    protected log (data: string): void {
		if (data && this.dgb) {
            // const msg: string = (data?.length > MAX_LOG_CHUNK) ? 
            //     data.substr(0, MAX_LOG_CHUNK) + "\n\n...\n\n" 
            //         : data
            console.log(data);
		}
	}
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	protected error(...data: any): void {
		if (data && this.dgb) {
            console.error(data);
		}
	}
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	protected warn(...data: any): void {
		if (data && this.dgb) {
            console.warn(data);
		}
	}
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	protected info(...data: any): void {
		if (data && this.dgb) {
            console.log(data);
		}
	}
}