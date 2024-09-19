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
import { DAA_SERVER_ADDRESS, DAA_SERVER_PORT, DANTI_CONFIG } from "../config";
import * as dgram from 'node:dgram';
import * as net from 'net';
import { DaaBands, DAAScenario, FlightData, ScenarioDataPoint, ScenarioDescriptor } from "../daa-server/utils/daa-types";

// ANY network address
const ADDR_ANY: string = "0.0.0.0";

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
     * Socket connection (TCP or UDP) for receiving data from the daa bands server
     */
    protected server: {
        udp: dgram.Socket,
        tcp: net.Server
    } = {
        udp: null,
        tcp: null
    };
    // TCP/IP server address and port
    protected tcpServerAddress: string = ADDR_ANY;
    protected tcpServerPort: number = DAA_SERVER_PORT;

	// callback functions
	protected computeBandsCB: (bands: DaaBands) => void;
	protected getFlightDataCB: (flightData: FlightData) => void;

    /**
     * Activates the worker
     */
    async activate (opt?: { verbose?: boolean }): Promise<boolean> {
        this.dgb = !!opt?.verbose;
		// create daa server that will be used by the bands worker to send data
		await this.createSocketServer();
		// create bands worker
        return new Promise ((resolve) => {
            this.log("[danti-worker] Booting up bands worker...");
            const dir: string = path.join(__dirname, "../danti-utils"); // folder containing DAABandsREPLV2
            const dantiConfig: string = DANTI_CONFIG || "DANTi_SL3.conf";
            const replOptions: string[] = [ "config", dantiConfig ];
			const daaServerAddrPort: string = `${DAA_SERVER_ADDRESS}:${DAA_SERVER_PORT}`;
			const daaServerOptions: string[] = ["daa-server", daaServerAddrPort]
            const args: string[] = [
                "-jar", path.join(dir, "DAABandsREPLV2.jar")
            ].concat(replOptions). concat(daaServerOptions);
            this.log(`[danti-worker] java ${args.join(" ")}`);

			// create bands worker
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
	 * Utility function, gets the bands data from a scenario descriptor
	 */
	/**
	 * Gets scenario datapoint
	 */
	getFirstDataPoint (scenario: ScenarioDescriptor): ScenarioDataPoint {
		const res: ScenarioDataPoint = {
			Wind: { deg: "0", knot: "0" },
			Ownship: null,
			Alerts: null,
			"Altitude Bands": null,
			"Heading Bands": null,
			"Horizontal Speed Bands": null,
			"Vertical Speed Bands": null,
			"Altitude Resolution": null,
			"Horizontal Direction Resolution": null,
			"Horizontal Speed Resolution": null,
			"Vertical Speed Resolution": null,
			"Contours": null,
			"Hazard Zones": null,
			Monitors: null,
			Metrics: null,
			WindVectors: null
		};
		if (scenario) {
			for (const key in res) {
				switch (key) {
					case "Monitors": {
						// res[key] = scenario[key];
						break;
					}
					case "Wind": {
						res[key] = scenario[key];
						break
					}
					default: {
						if (scenario[key]?.length) {
							res[key] = scenario[key][0];
						}
					}
				}
			}
		}
		return res;
	}
    /**
     * Creates socket connections to receive data from the socket
     */
    async createSocketServer (): Promise<boolean> {
        console.log("[danti-worker] Creating socket server...");
        // TCP
        this.server.tcp = net.createServer((socket: net.Socket) => {
            socket.on('error', (err: Error) => {
                console.error(`[danti-worker] TCP Server error:\n${err.stack}`);
                this.server.tcp.close();
            });
            socket.on('data', async (buf: Buffer) => {
				const DELIMITER: string = "¶";
				// process received data
				const dataString: string = buf.toLocaleString();
				// console.log("[danti-worker] ** Received socket message **", { dataString });
				try {
					// Data needs to be split because the TCP/IP protocol may concatenate multiple data to optimize throughput (see data coalescing)
					// Data is in JSON format { ... }, so concatenated data is in the form { .. }{ .. }{ .. } ... 
					// A delimiter is introduced in all '}{' pairs to ease the detection and split of concatenated data
					const dataElements: string[] = dataString?.replace(/}\s*{/g, `}${DELIMITER}{`).split(`${DELIMITER}`) || [];
					for (let i = 0; i < dataElements.length; i++) {
						const data = JSON.parse(dataElements[i]) || {};
						switch (data?.type) {
							case "bands": {
								// console.dir({ socketMessage: bands }, { depth: null });
								const desc: ScenarioDescriptor = data.val;
								const bands: DaaBands = this.getFirstDataPoint(desc);
								this.computeBandsCB(bands);
								break;
							}
							case "lla": {
								// console.dir({ socketMessage: bands }, { depth: null });
								const scenario: DAAScenario = data.val;
								const flightData: FlightData = scenario?.lla[scenario.steps[0]];
								this.getFlightDataCB(flightData);
							}
						}
					}
				} catch (err) {
					console.warn("[danti-worker] ** Warning: malformed JSON message", dataString, err);
				}
                // if (this.dmpFile) {
                // 	console.log(`Saving message to file ${this.dmpFile}...`);
                // 	fs.appendFileSync(this.dmpFile, msg + "\n\n", { encoding: 'binary' });
                // }
            });
            socket.on('connect', () => {
                const address: net.AddressInfo = <net.AddressInfo> socket.address();
                console.log(`[danti-worker] TCP/IP Connection established at ${address?.address}:${address?.port}`);
            });
            socket.on('close', () => {
                console.log(`[danti-worker] TCP/IP Closed by client`);
            });
        });
        this.server.tcp.listen(this.tcpServerPort, this.tcpServerAddress);
        console.log(`[connect-socket] TCP/IP Server ready at ${this.tcpServerAddress}:${this.tcpServerPort}`);
        // // UDP -- TODO
        // server.udp = dgram.createSocket('udp4');
        // server.udp.on('error', (err) => {
        //     console.error(`[connect-socket] UDP Server error:\n${err.stack}`);
        //     server.udp.close();
        // });
        // server.udp.on('message', (msg, rinfo) => {
        //     console.log(`[connect-socket] UDP Server received message: ${msg} from ${rinfo.address}:${rinfo.port}`);
        //     // if (this.dmpFile) {
        //     // 	console.log(`Saving message to file ${this.dmpFile}...`);
        //     // 	fs.appendFileSync(this.dmpFile, msg + "\n\n", { encoding: 'binary' });
        //     // }
        // });
        // server.udp.on('listening', () => {
        //     const address = server.udp.address();
        //     console.log(`[connect-socket] UDP Server listening at ${address.address}:${address.port}`);
        // });
        // server.udp.bind(UDP_PORT);
        console.log("[connect-socket] Done with creating sockets!");
        return true;
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
     * Sets a new stale threshold for traffic data
     */
    async staleThreshold(data: string): Promise<string> {
        return await this.sendText("stale-threshold", data);
    }
    /**
     * Sends compute-bands request to the worker
     */
    async computeBands(cb: (bands: DaaBands) => void): Promise<boolean> {
		this.computeBandsCB = cb;
		await this.sendText("compute-bands");
		return true;
		// const tmpDir: string = os.tmpdir();
        // const bandsFile: string = path.join(tmpDir, "REPL.json");
        // const fileBands: string = await fsUtils.readFile(bandsFile);
        // const llaFile: string = path.join(tmpDir, "REPL-scenario.json");
        // const lla: string = await fsUtils.readFile(llaFile);

		// return new Promise((resolve) => {
		// 	this.worker.on(DantiWorkerEvents.DidComputeBands, (evt: DidComputeBands) => {
		// 		resolve({ fileBands, bands: evt.bands, lla });
		// 	});
		// })
        // return { bands, lla };
    }
    /**
     * Sends compute-lla request to the worker
     */
    async computeLLA(cb: (lla: FlightData) => void): Promise<boolean> {
		this.getFlightDataCB = cb;
		await this.sendText("compute-lla");
		return true;
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