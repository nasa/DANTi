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

import { exit } from 'process';
import { DANTI_ADDRESS, DANTI_PORT, DBG } from '../config';
import * as WebSocket from 'ws';
import { 
    LabelsRequest,
    UnitsRequest,
    DantiDataSourceInterface, 
    DantiStreamerRequest, 
    EpochEndNotification, 
    OwnshipDataRequest, 
    OwnshipNameRequest, 
    TrafficDataRequest, 
    WindRequest,
    ConfigRequest,
    FlightPlanRequest,
    ResetRequest,
    AvionicsDataRequest,
    AvionicsData
} from '../danti-app/danti-interface';

function get_unique_id (format?: string) {
	let d: number = new Date().getTime();
	format = format || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
	const uuid = format.replace(/[xy]/g, (c: string) => {
		const r: number = ((d + Math.random() * 16) % 16) | 0;
		d = Math.floor(d / 16);
		return (c === 'x' ? r : (r & 0x7 | 0x8)).toString(16);
	});
	return uuid;
}

export interface SocketConnection {
    socket?: WebSocket;
    port: number;
    host: string;
}
export interface WebSocketConnection extends SocketConnection {
    socket?: WebSocket;
    port: number;
    host: string;
}
export interface StreamerHandlers {
    onClose?: () => void,
    onOpen?: () => void,
    onError?: () => void;
}
export interface StreamDescriptor {
    labels: string,
    units: string,
    ownshipName: string,
    content: string[]
}

/**
 * Generic Danti Data Source, sends scenario data to danti at periodic intervals
 */
export class DantiConnection implements DantiDataSourceInterface {
    // connection to danti-display
    protected danti: WebSocketConnection = { host: DANTI_ADDRESS, port: DANTI_PORT, socket: null };

    // quiet flag, used to define the level of debugging
    protected logEnabled: boolean = false;

    // hooks to handlers
    protected handlers: StreamerHandlers = {};

    /**
     * Constructor
     */
    constructor (opt?: { danti_address?: string, enableLog?: boolean }) {
        opt = opt || {};
        this.danti.host = opt.danti_address || DANTI_ADDRESS;
        this.logEnabled = !!opt?.enableLog;
    }

    /**
     * Creates a websocket connection
     */
    protected async createWebSocket (connection: WebSocketConnection): Promise<boolean> {
        if (!connection) { return false; }
        return new Promise ((resolve) => {
            if (connection.socket?.readyState === WebSocket.OPEN) {
                return true;
            }
            if (connection.socket?.readyState === WebSocket.CONNECTING) {
                false;
            }
            const address: string = connection.host || DANTI_ADDRESS;
            const port: number = connection.port || 8082;
            this.log(`[danti-connection] Trying to connect danti-display (${address}:${port})`);
            connection.socket = new WebSocket(`ws://${address}:${port}`);
            connection.socket.on('open', () => {
                this.log("[danti-connection] danti-display connected!");
                resolve(true);
                if (this.handlers?.onOpen) { this.handlers.onOpen(); }
            });
            connection.socket.on('error', (error: Error) => {
                console.error("[danti-connection] Unable to open connection with danti-display", error?.message);
                resolve(false);
                if (this.handlers?.onError) { this.handlers?.onError(); }
            });
            connection.socket.on('close', () => {
                this.log("[danti-connection] danti-display connection closed.");
                if (this.handlers?.onClose) { this.handlers?.onClose(); }
            });
            connection.socket.on('message', (message: WebSocket.Data) => {
                this.log('[danti-connection] Received: %s', message);
            });
        });
    }
    /**
     * Activates the data server
     * All data structures from previous sessions are automatically reset upon activation
     */
    async activate (opt?: StreamerHandlers): Promise<boolean> {
        this.handlers = opt || {};
        let success: boolean = await this.createWebSocket(this.danti);
        // clear aircraft cache
        if (success) {
            success = await this.reset();
        }
        return success;
    }
    /**
     * Sends a reset request to danti-server, i.e., clears ownship data, ownshipID, and traffic data, keeps labels and units
     */
    async reset (): Promise<boolean> {
        const req: ResetRequest = { id: get_unique_id(), type: "reset" };
        return await this.sendData(req);
    }
    /**
     * Sends data to danti-server
     */
    async sendData (req: DantiStreamerRequest): Promise<boolean> {
        if (req?.type) {
            return new Promise((resolve) => {
                this.log(`[danti-connection] Sending ${req.type} ${req.data ? req.data : ""} to DANTi`);
                this.danti.socket.send(JSON.stringify(req), (err?: Error) => {
                    if (err) {
                        this.log(`[danti-connection] Warning: Unable to send ${req.type} ${req.data ? req.data : ""}`, err);
                        return resolve(false);
                    }
                    // this.log("** data sent successfully! **");
                    return resolve(true);
                });
            })
        }
        return false;
    }
    /**
     * Sends traffic data to danti-server
     */
    async sendTrafficData (data: string): Promise<boolean> {
        if (data) {
            const req: TrafficDataRequest = { id: get_unique_id(), type: "traffic", data };
            return await this.sendData(req);
        }
        return false;
    }
    /**
     * Sends ownship data to danti-server
     */
    async sendOwnshipData (data: string): Promise<boolean> {
        if (data) {
            const req: OwnshipDataRequest = { id: get_unique_id(), type: "ownship", data };
            return await this.sendData(req);
        }
        return false;
    }
    /**
     * Sends ownship name to danti-server
     */
    async sendOwnshipName (data: string): Promise<boolean> {
        if (data) {
            const req: OwnshipNameRequest = { id: get_unique_id(), type: "ownship-name", data };
            return await this.sendData(req);
        }
        return false;
    }
    /**
     * Sends data received from the ownship avionics to danti-server
     */
    async sendAvionicsData (data: AvionicsData): Promise<boolean> {
        if (data) {
            const req: AvionicsDataRequest = { id: get_unique_id(), type: "avionics", data };
            return await this.sendData(req);
        }
        return false;
    }

    /**
     * Sends daa labels to danti-server
     */
    async sendLabels (data: string): Promise<boolean> {
        if (data) {
            const req: LabelsRequest = { id: get_unique_id(), type: "labels", data };
            return await this.sendData(req);
        }
        return false;
    }
    /**
     * Sends daa units to danti-server
     */
    async sendUnits (data: string): Promise<boolean> {
        if (data) {
            const req: UnitsRequest = { id: get_unique_id(), type: "units", data };
            return await this.sendData(req);
        }
        return false;
    }
    /**
     * Sends wind data to danti-server
     */
    async sendWind(data: string): Promise<boolean> {
        if (data) {
            const req: WindRequest = { id: get_unique_id(), type: "wind", data };
            return await this.sendData(req);
        }
        return false;
    }
    /**
     * Sends a compute bands request to danti-server
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async notifyEpochEnd (epoch?: number): Promise<boolean> {
        const req: EpochEndNotification = { id: get_unique_id(), type: "epoch-end" };
        return await this.sendData(req);
    }
    /**
     * Sends daa config to danti-server
     */
    async sendConfig (data: string): Promise<boolean> {
        if (data) {
            const req: ConfigRequest = { id: get_unique_id(), type: "config", data };
            return await this.sendData(req);
        }
        return false;
    }
    /**
     * Sends fligth plan to danti-server
     */
    async sendFlightPlan (data: string): Promise<boolean> {
        if (data) {
            const req: FlightPlanRequest = { id: get_unique_id(), type: "flight-plan", data };
            return await this.sendData(req);
        }
        return false;
    }
    /**
     * Prints log messages
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    log (...data: any): void {
        if (this.logEnabled && DBG && data) {
            console.log(data);
        }
    }
    /**
     * Streams given data
     */
    play (desc: StreamDescriptor, opt?: { interval?: number, loop?: boolean, stats?: string }): void {
        // periodic timer
        let timer: NodeJS.Timeout;
        // create instance
        const daaDataSource: DantiConnection = new DantiConnection();
        daaDataSource.activate({
            onClose: () => {
                clearInterval(timer);
                timer = null;
            }
        }).then(async (success: boolean) => {
            if (success) {
                // send labels and units
                daaDataSource.sendLabels(desc.labels);
                daaDataSource.sendUnits(desc.units);
                // send ownship name
                // daaStreamer.sendOwnshipName(desc.ownshipName);
                // send flight data and bands to danti-app
                const data: string[] = desc.content;
                let i: number = 0;
                let epoch: number = 0;
                const interval: number = opt?.interval || 1000;
                timer = setInterval(async () => {
                    // exit if the entire file has been scanned, unless we are looping
                    if (i >= data.length) {
                        if (opt?.loop) {
                            // restart
                            i = 0;
                        } else {
                            console.log(`[danti-connection] scenario end`);
                            if (opt?.stats) { console.log(opt.stats); }
                            // exit
                            exit(0);
                        } 
                    }
                    // send a burst of packets until the ownship is found
                    let ownship_sent: boolean = false;
                    for (; i < data.length; i++) {
                        const req: string = data[i];
                        if (req.includes(desc.ownshipName)) {
                            if (!ownship_sent) {
                                ownship_sent = true;
                                await daaDataSource.sendOwnshipData(req);
                            } else {
                                break;
                            }
                        } else {
                            await daaDataSource.sendTrafficData(req);
                        }
                    }
                    // then send an epoch end notification 
                    // to indicate that all relevant data has been sent
                    await daaDataSource.notifyEpochEnd(epoch++);
                }, interval);
            }
        });
    }
}