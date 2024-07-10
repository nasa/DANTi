/**
 * @author: Paolo Masci
 * @date: 2024.07.08
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
import { JavaProcessWorker, XPlaneAircraft, XPlaneConnection, XPlaneData } from "./xplane/xplane-connection";
import { DANTI_ADDRESS, STALE_THRESHOLD, DBG, AVIONICS_INTERVAL, TERMINATE_ON_DISCONNECT } from "../config";
import * as fs from 'fs';
import * as path from 'path';
import { exit } from "process";
import { AircraftData, AvionicsData, TrafficData } from "../danti-app/danti-interface";
import * as net from 'net';
import { today } from "./connect-utils";

// global clock
const useClock: boolean = false;
// millis flag
const useMillis: boolean = false;
// whether gdl90 traffic reports without tail number shoud be ignored
const INCLUDE_TRAFFIC_REPORTS_WITH_MISSING_TAIL_NUMBER: boolean = false;

/** message received from the GDL90 connection */
declare interface GDL90_TRAFFIC_INFO {
	traffic_alert_status: "NO_ALERT" | "TRAFFIC_ALERT",
	address_type: "ADS_B_WITH_ICAO_ADDRESS" | "ADS_B_WITH_SELF_ASSIGNED" | "TIS_B_WITH_ICAO_ADDRESS" | "TIS_B_WITH_TRACK_ID" | "SURFACE_VEHICLE" | "GROUND_STATION_BEACON" | "UNKNOWN",
	address: string,
	latitude: string, 
	longitude: string,
	pressure_altitude: { val: string, units: "ft" },
	airborne: boolean, 
	report_type: "REPORT_UPDATED" | "REPORT_EXTRAPOLATED" | "UNKNOWN",
	nic: "NIC_LESS_20NM" | "NIC_LESS_8NM" | "NIC_LESS_4NM" | "NIC_LESS_2NM" | "NIC_LESS_1NM" | "NIC_LESS_0_6NM" | "NIC_LESS_0_2NM" | "NIC_LESS_0_1NM" | "NIC_HPL_75M_AND_VPL_112M" | "NIC_HPL_25M_AND_VPL_37M" | "NIC_HPL_7M_AND_VPL_11M" | "UNKNOWN",
	nacp: "NACP_LESS_10NM" | "NACP_LESS_10NM" | "NACP_LESS_2NM" | "NACP_LESS_0_5NM" | "NACP_LESS_0_3NM" | "NACP_LESS_0_1NM" | "NACP_LESS_0_05NM" | "NACP_HFOM_30M_AND_VFOM_45M" | "NACP_HFOM_10M_AND_VFOM_15M" | "NACP_HFOM_3M_AND_VFOM_4M" | "UNKNOWN",
	horizontal_velocity: { val: string, units: "kn" },
	track_or_heading: { val: string, units: "kn", type: "TRUE_TRACK" | "MAG_HEADING" | "TRUE_HEADING" | "INVALID" },
	vertical_velocity: { val: string, units: "fpm" }, 
	emergency_code: "NONE" | "GENERAL" | "MEDICAL" | "MIN_FUEL" | "NO_COMM" | "UNLAWFUL_INT" | "DOWNED" | "INVALID",
	emitter_category: "NO_INFO" | "LIGHT" | "SMALL" | "LARGE" | "HIGH_VORTEX" | "HEAVY" | "HIGH_MANUEVER" | "ROTORCRAFT" | "GLIDER" | "LIGHTER_THAN_AIR" | "PARACHUTIST" | "ULTRA_LIGHT" | "UAV" | "SPACE" | "SURFACE_EMERG" | "SURFACE_SERVICE" | "POINT_OBSTACLE" | "CLUSTER_OBST" | "LINE_OBSTACLE" | "UNKNOWN",
	tail_number: string
}
declare interface GDL90_OWNSHIP_REPORT extends GDL90_TRAFFIC_INFO {
	type: "OWNSHIP_REPORT"
}
declare interface GDL90_TRAFFIC_REPORT extends GDL90_TRAFFIC_INFO {
	type: "TRAFFIC_REPORT"
}
declare interface GDL90_AHRS {
	type: "AHRS",
	roll: { val: string, units: "deg" },
	pitch: { val: string, units: "deg" },
	heading: { val: string, units: "deg" },
	indicated_airspeed: { val: string, units: "kn" },
	true_airspeed: { val: string, units: "kn" }
}
declare type GDL90_MESSAGE = GDL90_OWNSHIP_REPORT | GDL90_AHRS | GDL90_TRAFFIC_REPORT | any;

const INVALID_AVIONICS_DATA: AvionicsData = {
	name: "N/A", // tail number
	lat: { val: "0", units: "deg" }, // latitude
	lon: { val: "0", units: "deg" }, // longitude
	alt: { val: "0", units: "ft" }, // altitude
	track: { val: "0", units: "deg" }, // true track
	gs: { val: "0", units: "kn" }, // true ground speed
	vspeed: { val: "0", units: "fpm" }, // vertical speed
	wow: { val: "1", units: "N/A" }, // weight on wheels
	toa: { val: "N/A", units: "N/A" } // time of applicability
}

// Utility class for the socket connection
export class SocketConnection extends XPlaneConnection {
    // id of the DANTi instance, this will stay the same for the entire simulation run
    protected dantiId: string = "";
    // Ownship Name (this is typically a TailNumber, can change during a simulation run)
    protected ownshipName: string = "";

	// traffic data received from the gdl90 connection.
    protected trafficData: {[tailnumber:string]: TrafficData} = {};
	// avionics data received from the gdl90 connection.
	protected avionicsData: AvionicsData = INVALID_AVIONICS_DATA;
	protected validAvionicsData: boolean = false;

    // flag indicating whether the connection is active
    protected active: boolean = false;

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
	 * Utility function, updates avionics data
	 */
	updateAvionicsData (msg: GDL90_OWNSHIP_REPORT | GDL90_AHRS): boolean {
		if (msg) {
			switch (msg.type) {
				case "OWNSHIP_REPORT": {
                    const tail_number: string = msg.tail_number || "Ownship";
					this.avionicsData = {
						...this.avionicsData,
						name: tail_number, // tail number
						lat: { val: msg.latitude, units: "deg" }, // latitude
						lon: { val: msg.longitude, units: "deg" }, // longitude
						alt: { val: msg.pressure_altitude.val, units: msg.pressure_altitude.units }, // altitude
						track: { val: msg.track_or_heading.type === "INVALID" ? "0" : msg.track_or_heading.val, units: msg.track_or_heading.units }, // true track
						gs: { val: msg.horizontal_velocity.val, units: msg.horizontal_velocity.units }, // true ground speed
						vspeed: { val: msg.vertical_velocity.val, units: msg.vertical_velocity.units }, // vertical speed
						wow: { val: `${msg.airborne ? 0 : 1}`, units: "N/A" } // weight on wheels
					};
					this.validAvionicsData = (msg.track_or_heading && msg.track_or_heading?.type !== "INVALID");
                    this.setOwnshipName(tail_number);
					if (DBG) {
						console.log({ avionicsData: this.avionicsData, validAvionicsData: this.validAvionicsData });
					}
					break;
				}
				case "AHRS": {
					this.avionicsData = {
						...this.avionicsData,
						// roll: { val: string, units: "deg" },
						// pitch: { val: string, units: "deg" },
						heading: msg.heading,
						ias: msg.indicated_airspeed,
						tas: msg.true_airspeed
					};
					if (DBG) {
						console.log({ avionicsData: this.avionicsData, validAvionicsData: this.validAvionicsData });
					}
				}
				default: {
					// do nothing
					return false;
				}
			}
			return true;
		}
		return false;
	}
	/**
	 * Utility function, converts gdl90 ownship report to traffic data
	 */
	updateTrafficData (msg: GDL90_OWNSHIP_REPORT): boolean {
		if (msg && msg.tail_number || INCLUDE_TRAFFIC_REPORTS_WITH_MISSING_TAIL_NUMBER) {
			const trafficData: TrafficData = {
				name: msg.tail_number, // tail number
				lat: { val: msg.latitude, units: "deg" }, // latitude
				lon: { val: msg.longitude, units: "deg" }, // longitude
				alt: { val: msg.pressure_altitude.val, units: msg.pressure_altitude.units }, // altitude
				track: { val: msg.track_or_heading.type === "INVALID" ? "0" : msg.track_or_heading.val, units: msg.track_or_heading.units }, // true track
				gs: { val: msg.horizontal_velocity.val, units: msg.horizontal_velocity.units }, // true ground speed
				vspeed: { val: msg.vertical_velocity.val, units: msg.vertical_velocity.units }, // vertical speed
				wow: { val: `${msg.airborne ? 0 : 1}`, units: "N/A" }, // weight on wheels
				toa: { val: "N/A", units: "N/A" } // time of applicability
			};
			this.trafficData[msg.tail_number] = trafficData;
			if (DBG) {
				console.dir({ trafficData: this.trafficData }, { depth: null });
			}
			return true;
		}
		return false;
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
                    console.warn("[connect-gdl90] Warning: unable to write logFile", { logFile: this.logFile });
                }
            }
        }
    }
    error (err: string) {
        if (err?.trim()) { console.error(`[connect-gdl90] Error: ${err}`); }
        if (this.errFile) {
            try {
                fs.appendFileSync(this.errFile, "");
                if (err?.trim()) {
                    const data: string = typeof err === "string" ? JSON.stringify({ err: err }) : JSON.stringify(err);
                    fs.appendFileSync(this.errFile, data + "\n");
                }
            } catch (error) {
                console.warn("[connect-gdl90] Warning: unable to write errFile", { errFile: this.errFile });
            }
        }
    }
    /**
     * utility function, prints settings
     */
    printSettings (): void {
        this.log(`--- SETTINGS -------------------------`);
        this.log(`update interval: ${this.interval}ms`);
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
     * Shutdown the gdl90 connection
     */
    shutdown (): void {
        if (this.active) { exit(0); }
    }

    /**
     * Utility function, sets a new ownship name
     */
    setOwnshipName (name: string): boolean {
        if (name) {
            const oldName: string = this.ownshipName;
            if (oldName !== name) {
                this.log(`[connect-gdl90] New ownship name ${name} (old name=${oldName || "N/A"})`);
                this.ownshipName = name;
                const newLogFile: string = this.getLogFilePath();
                const newErrorFile: string = this.getErrorFilePath();
                if (newLogFile) { this.log(`[connect-gdl90] Session log will continue on file ${newLogFile}`); }
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
        this.log("[connect-gdl90] Clearing DANTi display...");
        await this.dantiConnection?.reset();
        // send new ownship name to DANTi
        this.log(`[connect-gdl90] Sending DANTi a new ownship name ${this.ownshipName}`);
        await this.dantiConnection?.sendOwnshipName(this.ownshipName);
    }

    /**
     * Creates a gdl90 connection using a process worker and the gdl90-udp library
     */
    async connectGdl90 (): Promise<boolean> {
        console.log("[connect-gdl90] Creating GDL90 connection...");
		// connect to the testbed
		const gdl90: JavaProcessWorker = new JavaProcessWorker();
		const GDL90_LIB: string = path.normalize(path.join("dist", "danti-connect", "gdl90", "gdl90-udp"))
		const DELIMITER: string = "¶";
		await gdl90.run(GDL90_LIB, {
			args: [ "json" ],
			cb: async (dt: string) => {
				if (dt) {
					try {
						// Data needs to be split because the gdl90 library may concatenate multiple messages
						// Data is in JSON format { ... }, so concatenated data is in the form { .. }{ .. }{ .. } ... 
						// A delimiter is introduced in all '}{' pairs to ease the detection and split of concatenated data
						const dataElements: string[] = dt?.replace(/}\s*{/g, `}${DELIMITER}{`).split(`${DELIMITER}`) || [];
						for (let i = 0; i < dataElements.length; i++) {
							console.log("[connect-gdl90] Decoding ", dataElements[i]);
							let msg: GDL90_MESSAGE = JSON.parse(dataElements[i]) || {};
							switch (msg.type) {
								case "OWNSHIP_REPORT": {
									console.log(`[connect-gdl90] Received ownship/avionics data`, msg);
									this.updateAvionicsData(msg);
									break;
								}
								case "AHRS": {
									console.log(`[connect-gdl90] Received AHRS data`, msg);
									this.updateAvionicsData(msg);
									break;
								}
								case "TRAFFIC_REPORT": {
									console.log(`[connect-gdl90] Received traffic data`, msg);
									this.updateTrafficData(msg);
									break;
								}
								default: {
									// do nothing
									break;
								}
							}
						}
					} catch (err) {
						console.error("[connect-gdl90] Error: malformed GDL90 message", dt, err);
					}
				}
			}
		});
        console.log("[connect-gdl90] Done with creating GDL90 connection!");
        return true;
    }

    // process args
    processArgs (args: string[]): void {
        console.log("[connect-gdl90] parsing args: ", args);
        for (let i = 0; i < args?.length; i++) {
            if (args[i].toLocaleLowerCase() === "freq" || args[i].toLocaleLowerCase() === "-freq" || args[i].toLocaleLowerCase() === "--freq") {
                // use the given update frequency for DANTi
                i++;
                if (i < args.length) {
                    const val: number = parseFloat(args[i]);
                    if (isFinite(val)) {
                        this.interval = val;
                        console.log("danti refresh interval = " + this.interval + "ms");
                    } else {
                        console.warn(`[connect-gdl90] Warning: malformed frequency value, expected numeric value in millis, found ${args[i]}`);
                    }
                } else {
					console.warn(`[connect-gdl90] Warning: frequency option used but value not provided`);
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
					console.warn(`[connect-gdl90] Warning: logdir option used by folder name not provided`);
				}
            }
        }
    }

    /**
     * Connect DANTi display and forward data received from socket or from file
     */
    async connectDanti (): Promise<void> {
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
        console.log("[connect-gdl90] Sending new stale threshold", { staleThreshold });
        await this.dantiConnection?.sendStaleThreshold(`${staleThreshold}`);
		this.active = true;
        console.log("[connect-gdl90] Starting periodic send to DANTi...");
        this.timer = setInterval (() => {
            this.send2Danti();
        }, this.interval);
    }

    // periodically send received data to danti
    async send2Danti (): Promise<void> {
        if (this.trafficData) {
			const trafficData: TrafficData[] = Object.values(this.trafficData) || [];
            // convert socket danta to the format expected by DANTi
            const state: XPlaneData = this.SocketData2XPlaneData(
				trafficData, 
				this.validAvionicsData ? this.avionicsData : null, 
				{ includeGroundTraffic: false }
			);
            if (state) {
                // send ownship data is valid when the ownship has a name
                if (state.ownship?.name) {
                    this.log("[connect-gdl90] Sending data to DANTi Display", { quietConsole: true });
                    this.log(state, { quietConsole: true });
                    // console.dir(state, { depth: null });

                    // send ownship data
                    const ownshipData: string = connection.printDaaAircraft(
                        state, 0, { useClock, useMillis }
                    );
                    // log("[connect-gdl90] ownship data", ownshipData);
                    // send ownship data -- this will be used by DAIDALUS to compute maneuver recommendations
                    await this.dantiConnection?.sendOwnshipData(ownshipData);
                    // send avionics data -- this will be used by DANTi to render the display
                    const avionics: AvionicsData[] =  this.validAvionicsData ? [ this.avionicsData ] 
						: trafficData.filter((ac: TrafficData) => { return ac.name === this.ownshipName; });
                    if (avionics?.length === 1) {
						// console.log("[connect-gdl90] Sending avionics data...");
                        await this.dantiConnection?.sendAvionicsData(avionics[0]);
                    } else {
                        console.warn("[connect-gdl90] ** Warning: avionics data not available **");
                    }
                } else {
                    // invalid ownship, clear traffic data
                    state.traffic = [];
                }
				// send traffic info
				const acData: string[] = connection.printDaaTraffic(
					state, { useClock, useMillis }
				);
				// console.log("[connect-gdl90] Sending traffic data...");
				// log("[connect-gdl90] Traffic", acData);
				for (let i = 0; i < acData?.length; i++) {
					await this.dantiConnection?.sendTrafficData(acData[i]);
				}
            }
			if (this.throttleCounter === 0) {
				// advance clock every second
				connection.advanceClock();
				// notify epoch end to indicate all available data have been sent
				// console.log("[connect-gdl90] Sending epock end...");
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
connection.connectGdl90();
connection.connectDanti();
