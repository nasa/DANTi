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
 * @author Paolo Masci
 * @date Mar 27, 2024
 * @desc Utility functions for connecting DANTi to a DAS-B GDL90 receiver
 */

import { DANTI_ADDRESS, DANTI_PORT, DBG } from '../config';
import * as WebSocket from 'ws';
import * as dgram from 'node:dgram';
import * as fs from 'fs';
import { 
    DantiDataSourceInterface, 
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
 * Stratus3 Connection opens a UDP socket on port 4000 with a Stratus 3 receiver
 */
export class GDL90Connection implements DantiDataSourceInterface {
    // connection to danti-display
    protected danti: WebSocketConnection = { host: DANTI_ADDRESS, port: DANTI_PORT, socket: null };

    // UDP server
    protected server: dgram.Socket;

    // quiet flag, used to define the level of debugging
    protected logEnabled: boolean = false;

    // hooks to handlers
    protected handlers: StreamerHandlers = {};

    // dump file, stores all received messages
    protected dmpFile: string;

    /**
     * Constructor
     */
    constructor (opt?: { danti_address?: string, enableLog?: boolean }) {
        opt = opt || {};
        this.danti.host = opt.danti_address || DANTI_ADDRESS;
        this.logEnabled = !!opt?.enableLog;
    }
    sendTrafficData(data: string): Promise<boolean> {
        throw new Error('Method not implemented.');
    }
    sendOwnshipData(data: string): Promise<boolean> {
        throw new Error('Method not implemented.');
    }
    sendOwnshipName(data: string): Promise<boolean> {
        throw new Error('Method not implemented.');
    }
    sendLabels(data: string): Promise<boolean> {
        throw new Error('Method not implemented.');
    }
    sendUnits(data: string): Promise<boolean> {
        throw new Error('Method not implemented.');
    }
    sendWind(data: string): Promise<boolean> {
        throw new Error('Method not implemented.');
    }

    /**
     * Creates a UDP socket connection on port 4000
     */
    protected async createUdpSocket (): Promise<boolean> {
        this.server = dgram.createSocket('udp4');
        this.server.on('error', (err) => {
            console.error(`UDP Server error:\n${err.stack}`);
            this.server.close();
        });
        this.server.on('message', (msg, rinfo) => {
            console.log(`UDP Server received message: ${msg} from ${rinfo.address}:${rinfo.port}`);
            if (this.dmpFile) {
                console.log(`Saving message to file ${this.dmpFile}...`);
                fs.appendFileSync(this.dmpFile, msg + "\n\n");
            }
        });
        this.server.on('listening', () => {
            const address = this.server.address();
            console.log(`UDP Server listening ${address.address}:${address.port}`);
        });
        this.server.bind(4000);
        return true;
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
    async activate (opt?: { handlers?: StreamerHandlers, dmpFile?: string }): Promise<boolean> {
        this.handlers = opt?.handlers || {};
        this.dmpFile = opt?.dmpFile || null;
        console.log("[gdl90-connection] Activate", opt);
        if (this.dmpFile) {
            try {
                fs.writeFileSync(this.dmpFile, "", { encoding: 'binary' });
                console.warn(`[gdl90-connection] Received messages will be saved to ${this.dmpFile}`);
            } catch (err) {
                console.warn(`[gdl90-connection] Warning: unable to write file ${this.dmpFile}`, { err });
                this.dmpFile = null;
            }
        }
        let success: boolean = await this.createUdpSocket();
        // success = success && await this.createWebSocket(this.danti);
        // // clear aircraft cache
        // if (success) {
        //     success = await this.reset();
        // }
        return success;
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
}