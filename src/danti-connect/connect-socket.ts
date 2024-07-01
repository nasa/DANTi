/**
 * @author: Paolo Masci
 * @date: 2024.06.27
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

import { DantiConnection } from "./danti-connection";
import { XPlaneAircraft, XPlaneConnection, XPlaneData } from "./xplane/xplane-connection";
import { DANTI_ADDRESS, STALE_THRESHOLD, DBG, AVIONICS_INTERVAL, TERMINATE_ON_DISCONNECT } from "../config";
import * as fs from 'fs';
import * as path from 'path';
import { exit } from "process";
import { AircraftData, AvionicsData, TrafficData } from "../danti-app/danti-interface";
import * as dgram from 'node:dgram';
import * as net from 'net';

// global clock
const useClock: boolean = false;
// millis flag
const useMillis: boolean = false;
// ANY network address
const ADDR_ANY: string = "0.0.0.0";
const DEFAULT_TCP_PORT: number = 8090;
const VERBOSE_DBG: boolean = false;

/** message received from the socket connection */
declare type SocketMsg = 
    { type: "avionics", danti: String, data: AvionicsData } 
    | { type: "traffic", danti: String, data: TrafficData }
    | { type: "ctrl", danti: String, data: string }
    | any;

/**
 * Utility function, expands the leading ~/ in fname with the home folder $HOME_DIR
 * and normalizes the path structure
 * This function should be used before invoking any nodeJS function from fs and path
 * because nodeJS does not understand ~/, it's a shell thing
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
export const HOME_DIR: string = require('os').homedir();
export function tildeExpansion(pathName: string): string {
    if (pathName) {
        if (pathName.startsWith("~/") || pathName === "~") {
            pathName = pathName.replace("~", HOME_DIR);
        }
        return path.normalize(pathName);
    }
    return pathName;
}
// utility function, returns todays' date and time in the following format: 20221129_133015
export function today (): string {
    const date: Date = new Date();
    return date.getFullYear() 
    + `${date.getMonth() < 10 ? `0${date.getMonth()}` : `0${date.getMonth()}`}` 
    + `${date.getDay() < 10 ? `0${date.getDay()}` : `0${date.getDay()}`}`
    + "_"
    + `${date.getHours() < 10 ? `0${date.getHours()}` : `0${date.getHours()}`}`
    + `${date.getMinutes() < 10 ? `0${date.getMinutes()}` : `0${date.getMinutes()}`}`
    + `${date.getSeconds() < 10 ? `0${date.getSeconds()}` : `0${date.getSeconds()}`}`;
}

// Utility class for the socket connection
export class SocketConnection extends XPlaneConnection {
    // id of the DANTi instance, this will stay the same for the entire simulation run
    protected dantiId: string = "";
    // Ownship Name (this is typically a TailNumber, can change during a simulation run)
    protected ownshipName: string = "";

    // data received from the socket, fields are updated incrementally as information is received
    protected trafficData: TrafficData[] = [];

	// avionics data received from the socket. Includes only ownship data. Updates provided at 20Hz.
	protected avionicsData: AvionicsData = null;
	protected validAvionicsData: boolean = false;

    // flag indicating whether the connection is active
    protected active: boolean = false;

    // TCP/IP server address and port
    protected tcpServerAddress: string = ADDR_ANY;
    protected tcpServerPort: number = DEFAULT_TCP_PORT;
    // let UDP_PORT: number = 8091;
    // interval for retrying to establish the connection to DANTi
    protected RETRY_INTERVAL: number = 2000; //ms

    // default danti address is localhost
    protected dantiAddress: string = DANTI_ADDRESS; // typically "0.0.0.0" or "127.0.0.1";

    // danti display refresh rate
    protected interval: number = AVIONICS_INTERVAL; // ms -- 1000ms = 1Hz, 500ms = 2Hz, 250ms = 4Hz, 200ms = 5Hz, 125ms = 8Hz
	protected throttleValue: number = (1000 / this.interval) + 1;
	protected throttleCounter: number = 0;

	// log folder, disabled by default, can be set from command line arguments -log
	protected LOG_DIR: string = null;
    // log file
    protected logFile: string = null;
    // error log
    protected errFile: string = null;
    // test flag, used for debugging purposes
    protected testFlag: boolean = false;
    
    /**
     * Socket connection (TCP or UDP)
     */
    protected server: {
        udp: dgram.Socket,
        tcp: net.Server
    } = {
        udp: null,
        tcp: null
    };
    
    /**
     * connection to DANTi using websockets
     */
    protected dantiConnection: DantiConnection;
    protected timer: NodeJS.Timeout;

    /**
     * Utility function, converts ownship data to xplane data
     */
    OwnshipData2XPlaneAircraft (data: AircraftData): XPlaneAircraft {
        return data?.name ? {
            name: data.name,
            lat: data.lat,
            lon: data.lon,
            alt: data.alt,
            heading: data.heading,
            vspeed: data.vspeed,
            airspeed: data.gs,
            time: data.time,
            error: data.error,
        } : null;
    }
    /**
     * Utility function, converts aircraft data to xplane data
     */
    TrafficData2XPlaneAircraft (data: AircraftData): XPlaneAircraft {
        return data?.name ? {
            name: data.name,
            lat: data.lat,
            lon: data.lon,
            alt: data.alt,
            heading: data.track, // for traffic, use track instead of heading
            vspeed: data.vspeed,
            airspeed: data.gs,
            time: data.time,
            error: data.error,
        } : null;
    }
    /**
     * Utility function converts Socket data to XPlane data
     */
    SocketData2XPlaneData (trafficData: TrafficData[], avionicsData: AvionicsData, opt?: { includeGroundTraffic?: boolean }): XPlaneData {
        if (this.ownshipName) {
            const state: XPlaneData = { ownship: null, traffic: [] };
            for (let i = 0; i < trafficData?.length; i++) {
                const ac: TrafficData = trafficData[i];
                if (ac?.name === this.ownshipName) {
                    state.ownship = this.OwnshipData2XPlaneAircraft(ac);
                } else {
					const acAirborne: boolean = (+ac.wow?.val === 0);
					if (acAirborne || opt?.includeGroundTraffic) {
	                    state.traffic.push(this.TrafficData2XPlaneAircraft(ac));
					}
                }
            }
			// prefer avionics data for the ownship, if the information is available
			if (this.avionicsData) {
				state.ownship = this.OwnshipData2XPlaneAircraft(avionicsData);
			}
            return state;
        }
        return null;
    }
    
    /**
     * utility function, generates the log file name for a given danti ID. This log file contains flight data.
     */
    getLogFilePath (): string {
        if (this.LOG_DIR) {
			const APPLICATION: string = "DANTi";
			const ID: string = (this.dantiId || "") + "_" + (this.ownshipName || "");
			const TIMESTAMP: string = today();
			// the log file is in the form {APPLICATION}_{ID}_{TIMESTAMP}, e.g., DANTi_NASAU01_20221129_133015
			const LOG_FILENAME: string = `${APPLICATION}_${ID}_${TIMESTAMP}.log`;
			const LOG_FILE: string = path.resolve(path.join(this.LOG_DIR, LOG_FILENAME));
			return LOG_FILE;
		}
		return null;
    }
    /**
     * utility function, generates the error file name for a given danti ID. This error file contains all errors and warnings.
     */
    getErrorFilePath (): string {
        if (this.LOG_DIR) {
			const APPLICATION: string = "DANTi";
			const ID: string = (this.dantiId || "") + "_" + (this.ownshipName || "");
			const TIMESTAMP: string = today();
			// the log file is in the form {APPLICATION}_{ID}_{TIMESTAMP}, e.g., DANTi_NASAU01_20221129_133015
			const LOG_FILENAME: string = `${APPLICATION}_${ID}_${TIMESTAMP}.err`;
			const LOG_FILE: string = path.resolve(path.join(this.LOG_DIR, LOG_FILENAME));
			return LOG_FILE;
		}
		return null;
    }
    /**
     * utility function, used for logging
     */
    log (info: string | XPlaneData, extra?: { quietConsole?: boolean }) {
        if (DBG) {
            if (!extra?.quietConsole) { console.dir(info, { depth: null }); }
            if (this.logFile) {
                try {
                    const data: string = typeof info === "string" ? JSON.stringify({ info }) : JSON.stringify(info);
                    fs.appendFileSync(this.logFile, data + "\n");
                } catch (error) {
                    console.warn("[connect-socket] Warning: unable to write logFile", { logFile: this.logFile });
                }
            }
        }
    }
    error (err: string) {
        if (err?.trim()) { console.error(`[connect-socket] Error: ${err}`); }
        if (this.errFile) {
            try {
                fs.appendFileSync(this.errFile, "");
                if (err?.trim()) {
                    const data: string = typeof err === "string" ? JSON.stringify({ err: err }) : JSON.stringify(err);
                    fs.appendFileSync(this.errFile, data + "\n");
                }
            } catch (error) {
                console.warn("[connect-socket] Warning: unable to write errFile", { errFile: this.errFile });
            }
        }
    }
    /**
     * utility function, prints settings
     */
    printSettings (): void {
        this.log(`--- SETTINGS -------------------------`);
        this.log(`DANTi ID: ${this.dantiId || "N/A"}`);
        this.log(`Ownship name: ${this.ownshipName || "N/A"}`);
        // log(`update interval: ${desc?.interval || "N/A"}`);
        this.log(`TCP/IP server: ${this.tcpServerAddress}:${this.tcpServerPort}`);
        // log(`UDP connection: ${ADDR_ANY}:${UDP_PORT}`);
        if (DBG) {
            this.log(`log file: ${this.logFile}`);
            this.log(`err file: ${this.errFile}`);
        }
        if (this.testFlag) {
            this.log(`test flag: ${this.testFlag}`);
        }
        this.log(`--------------------------------------`);
    }
    /**
     * Utility function, waits xx ms
     */
    async sleep (ms: number): Promise<void> {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }

    /**
     * Shutdown the DANTi instance
     */
    shutdown (): void {
        if (this.active) { exit(0); }
    }

    /**
     * Utility function, initializes the DANTi ID
     */
    initializeDantiId (id: string): boolean {
        if (!this.dantiId && id) {
            this.log(`[connect-socket] Initializing DANTi ID to ${id}`);
            this.dantiId = id;
            return true;
        }
        return false;
    }

    /**
     * Utility function, sets a new ownship name
     */
    setOwnshipName (name: string): boolean {
        if (name) {
            const oldName: string = this.ownshipName;
            if (oldName !== name) {
                this.log(`[connect-socket] New ownship name ${name} (old name=${oldName || "N/A"})`);
                this.ownshipName = name;
                const newLogFile: string = this.getLogFilePath();
                const newErrorFile: string = this.getErrorFilePath();
                if (newLogFile) { this.log(`[connect-socket] Session log will continue on file ${newLogFile}`); }
                // create a new log file every time a new ownship is used
                this.logFile = newLogFile;
                this.errFile = newErrorFile;
                // print settings
                this.printSettings();
                return true;
            }
        }
        return false;
    }

    /**
     * Utility function, resets the danti display
     */
    async resetDanti (): Promise<void> {
        this.log("[connect-socket] Clearing DANTi display...");
        await this.dantiConnection?.reset();
        // send new ownship name to DANTi
        this.log(`[connect-socket] Sending DANTi a new ownship name ${this.ownshipName}`);
        await this.dantiConnection?.sendOwnshipName(this.ownshipName);
    }

    /**
     * Utility function, processes control messages
     * Control messages are in one of the following forms:
     * - DANTi:<dantiID>:<ownshipName>
     * - DANTi:<dantiID>:shutdown 
     * - DANTi:all:shutdown
     */
    async processControlMessage (data: string): Promise<boolean> {
        console.log("[connect-socket] Received Control Message", data);
        const info: string[] = data?.split(":");
        if (info?.length === 3 && info[0] === "DANTi") {
            switch (info[2]) {
                case "shutdown": { // shut down the target danti instance
                    if (info[1] === "all" || info[1] === this.dantiId) {
                        this.shutdown();
                    }
                    break;
                }
                default: { // update ownship name
                    // initialize danti ID if it's not already initialized
                    this.initializeDantiId(info[1]);
                    // update ownship name
                    const changed: boolean = this.setOwnshipName(info[2]);
                    if (changed) {
                        // reset DANTi display and traffic data id the ownship name has changed
                        await this.resetDanti();
                    }
                    break;
                }
            }
        }
        return true;
    }

    /**
     * Creates socket connections to receive data from the ATOS
     */
    connectToSocket (): boolean {
        console.log("[connect-socket] Creating sockets for ATOS...");
        // TCP
        this.server.tcp = net.createServer((socket: net.Socket) => {
            socket.on('error', (err: Error) => {
                console.error(`[connect-socket] TCP Server error:\n${err.stack}`);
                this.server.tcp.close();
            });
            socket.on('data', async (buf: Buffer) => {
				const DELIMITER: string = "¶";
				// process received data
				const dataString: string = buf.toLocaleString();
				try {
					// Data needs to be split because the TCP/IP protocol may concatenate multiple data to optimize throughput (see data coalescing)
					// Data is in JSON format { ... }, so concatenated data is in the form { .. }{ .. }{ .. } ... 
					// A delimiter is introduced in all '}{' pairs to ease the detection and split of concatenated data
					const dataElements: string[] = dataString?.replace(/}\s*{/g, `}${DELIMITER}{`).split(`${DELIMITER}`) || [];
					for (let i = 0; i < dataElements.length; i++) {
						let msg: SocketMsg = JSON.parse(dataElements[i]) || {};
						if (VERBOSE_DBG && msg?.type) { console.dir(msg, { depth: null }); }
						msg.type = msg?.type || "N/A";
						// check if the message was intended for this instance of DANTi
						if (this.dantiId === msg.danti) {
							switch (msg.type) {
								case "ownship":
								case "avionics": {
									console.log(`[connect-socket] Received ownship/avionics data (ownship=${this.ownshipName}, danti=${this.dantiId})`, msg.data);
									this.avionicsData = msg.data;
									this.validAvionicsData = true;
									break;
								}	
								case "traffic": {
									console.log(`[connect-socket] Received traffic data (ownship=${this.ownshipName}, danti=${this.dantiId})`, msg.data);
									this.trafficData = msg.data;
									break;
								}
								case "ctrl": {
									console.log(`[connect-socket] Received control message (ownship=${this.ownshipName}, danti=${this.dantiId})`, msg.data);
									await this.processControlMessage(msg.data);
									break;
								}
								default: {
									break;
								}
							}
						} else {
							console.log(`[connect-socket] Skipping message (ownship=${this.ownshipName}, danti=${this.dantiId})`, msg);
						}
					}
				} catch (err) {
					console.warn("[connect-socket] ** Warning: malformed JSON message", dataString, err);
				}
                // if (this.dmpFile) {
                // 	console.log(`Saving message to file ${this.dmpFile}...`);
                // 	fs.appendFileSync(this.dmpFile, msg + "\n\n", { encoding: 'binary' });
                // }
            });
            socket.on('connect', () => {
                const address: net.AddressInfo = <net.AddressInfo> socket.address();
                console.log(`[connect-socket] TCP/IP Connection established at ${address?.address}:${address?.port}`);
            });
            socket.on('close', () => {
                console.log(`[connect-socket] TCP/IP Closed by client`);
				if (TERMINATE_ON_DISCONNECT) {
					this.shutdown();
				}
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

    // process args
    processArgs (args: string[]): void {
        console.log("[connect-socket] parsing args: ", args);
        for (let i = 0; i < args?.length; i++) {
            if (/localhost|\d+\.\d+\.\d+\.\d+/g.test(args[i])) {
                // danti address provided at the command line
                this.dantiAddress = args[i];
            } else if (args[i].toLocaleLowerCase() === "ownship" || args[i].toLocaleLowerCase() === "-ownship" || args[i].toLocaleLowerCase() === "--ownship") {
                // use this call sign for danti
                i++;
                if (i < args.length) {
                    const data: string[] = args[i].split(":");
                    if (data?.length === 2) {
                        this.initializeDantiId(data[0]);
                        this.setOwnshipName(data[1]);
                        console.log("danti ID = " + this.dantiId);
                        console.log("ownship name = " + this.ownshipName);
                    } else {
                        console.warn(`[connect-socket] Warning: malformed aircraft identifier, expected <dantiId>:<ownshipName>, found ${data}`);
                    }
                }
            } else if (args[i].toLocaleLowerCase() === "freq" || args[i].toLocaleLowerCase() === "-freq" || args[i].toLocaleLowerCase() === "--freq") {
                // use the given update frequency for DANTi
                i++;
                if (i < args.length) {
                    const val: number = parseFloat(args[i]);
                    if (isFinite(val)) {
                        this.interval = val;
                        console.log("danti refresh interval = " + this.interval + "ms");
                    } else {
                        console.warn(`[connect-socket] Warning: malformed frequency value, expected numeric value in millis, found ${args[i]}`);
                    }
                } else {
					console.warn(`[connect-socket] Warning: frequency option used but value not provided`);
				}
            } else if (args[i].toLocaleLowerCase() === "test" || args[i].toLocaleLowerCase() === "-test" || args[i].toLocaleLowerCase() === "--test") {
                this.testFlag = true;
            } else if (args[i].toLocaleLowerCase() === "logdir" || args[i].toLocaleLowerCase() === "-logdir" || args[i].toLocaleLowerCase() === "--logdir") {
				// use the given folder for DANTi logs
				i++;
				if (i < args.length) {
					this.LOG_DIR = path.resolve(args[i]);
					console.log("danti log = " + this.LOG_DIR);
				} else {
					console.warn(`[connect-socket] Warning: logdir option used by folder name not provided`);
				}
            }
        }
    }

    /**
     * Connect to DANTi and forward data received from socket or from file
     */
    async connectToDanti (): Promise<void> {
        this.dantiConnection = new DantiConnection({ danti_address: this.dantiAddress });
        let connected: boolean = await this.dantiConnection.activate();
        while (!connected) {
            console.warn(`Unable to connect to DANTi, retrying in ${this.RETRY_INTERVAL}ms...`);
            await this.sleep(this.RETRY_INTERVAL);
            connected = await this.dantiConnection.activate();
        }
        // set danti labels and units
        const labels: string = connection.printLabels();
        await this.dantiConnection?.sendLabels(labels);
        const units: string = connection.printUnits();
        await this.dantiConnection?.sendUnits(units);
        // set stale threshold
        const staleThreshold: number = STALE_THRESHOLD;
        console.log("[connect-socket] Sending new stale threshold", { staleThreshold });
        await this.dantiConnection?.sendStaleThreshold(`${staleThreshold}`);
		this.active = true;
        console.log("[connect-socket] Starting periodic send to DANTi...");
        this.timer = setInterval (() => {
            this.send2Danti();
        }, this.interval);
    }

    // periodically send received data to danti
    async send2Danti (): Promise<void> {
        if (this.trafficData) {
            // convert socket danta to the format expected by DANTi
            const state: XPlaneData = this.SocketData2XPlaneData(
				this.trafficData, 
				this.validAvionicsData ? this.avionicsData : null, 
				{ includeGroundTraffic: false }
			);
            if (state) {
                // send ownship data is valid when the ownship has a name
                if (state.ownship?.name) {
                    this.log("[connect-socket] Sending data to DANTi Display", { quietConsole: true });
                    this.log(state, { quietConsole: true });
                    // console.dir(state, { depth: null });

                    // send ownship data
                    const ownshipData: string = connection.printDaaAircraft(
                        state, 0, { useClock, useMillis }
                    );
                    // log("[connect-socket] ownship data", ownshipData);
                    // send ownship data -- this will be used by DAIDALUS to compute maneuver recommendations
                    await this.dantiConnection?.sendOwnshipData(ownshipData);
                    // send avionics data -- this will be used by DANTi to render the display
                    const avionics: AvionicsData[] =  this.validAvionicsData ? [ this.avionicsData ] 
						: this.trafficData.filter((ac: TrafficData) => { return ac.name === this.ownshipName; });
                    if (avionics?.length === 1) {
						// console.log("[connect-socket] Sending avionics data...");
                        await this.dantiConnection?.sendAvionicsData(avionics[0]);
                    } else {
                        console.warn("[connect-socket] ** Warning: avionics data not available **");
                    }
                } else {
                    // invalid ownship, clear traffic data
                    state.traffic = [];
                }
				// send traffic info
				const acData: string[] = connection.printDaaTraffic(
					state, { useClock, useMillis }
				);
				// console.log("[connect-socket] Sending traffic data...");
				// log("[connect-socket] Traffic", acData);
				for (let i = 0; i < acData?.length; i++) {
					await this.dantiConnection?.sendTrafficData(acData[i]);
				}
            }
			if (this.throttleCounter === 0) {
				// advance clock every second
				connection.advanceClock();
				// notify epoch end to indicate all available data have been sent
				// console.log("[connect-socket] Sending epock end...");
				await this.dantiConnection?.notifyEpochEnd();
			}
			this.throttleCounter = (this.throttleCounter + 1) % this.throttleValue;
        }        
    }
}

// process args from the command line
const args: string[] = process.argv?.slice(2);

const connection: SocketConnection = new SocketConnection();
connection.processArgs(args);
connection.connectToSocket();
connection.connectToDanti();
