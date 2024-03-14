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

import { DANTI_ADDRESS, DANTI_PORT } from "../config";
import { FlightPlan } from "../daa-displays/daa-utils";
import { DantiData } from "./danti-display";

export const DANTI_URL: string = `${DANTI_ADDRESS}:${DANTI_PORT}`;

export declare type DantiRequestType = 
    "register-danti" | "register-virtual-pilot" | "render-request" 
    | "traffic" | "ownship" | "ownship-name" | "flight-plan"
    | "labels" | "units" | "wind" | "config" 
    | "epoch-end" | "reset" | "avionics" | "stale-threshold";
export declare interface DantiRequest {
    id: string, // unique message id
    type: DantiRequestType,
    data?: unknown
}

export declare interface DantiResponse {
    req: DantiRequest,
    res: unknown
}

export declare type DantiStreamerRequest = RegisterRequest | RenderRequest | TrafficDataRequest
    | OwnshipDataRequest | LabelsRequest | UnitsRequest | WindRequest | OwnshipNameRequest
    | EpochEndNotification | ConfigRequest | FlightPlanRequest | ResetRequest | AvionicsDataRequest
    | StaleThresholdRequest;

export declare interface RegisterRequest extends DantiRequest {
    type: "register-danti" // message type
}
export declare interface RegisterResponse {
    success: boolean
}

export declare interface ResetRequest extends DantiRequest {
    type: "reset"
}

export declare interface RenderRequest extends DantiRequest {
    type: "render-request",
    data: DantiData
}
export declare interface SetFlightPlanRequest extends DantiRequest {
    type: "flight-plan",
    data: FlightPlan
}

export declare interface FlightPlanRequest extends DantiRequest {
    type: "flight-plan",
    data: string
}

export declare interface TrafficDataRequest extends DantiRequest {
    type: "traffic",
    data: string
}
export declare interface TrafficDataResponse {
    success: boolean
}

export declare interface OwnshipDataRequest extends DantiRequest {
    type: "ownship",
    data: string
}
export declare interface OwnshipDataResponse {
    success: boolean
}

export declare interface AvionicsDataRequest extends DantiRequest {
    type: "avionics",
    data: AvionicsData
}
export declare interface AvionicsDataResponse {
    success: boolean
}

export declare interface LabelsRequest extends DantiRequest {
    type: "labels",
    data: string
}
export declare interface LabelsResponse {
    success: boolean
}

export declare interface UnitsRequest extends DantiRequest {
    type: "units",
    data: string
}
export declare interface UnitsResponse {
    success: boolean
}

export declare interface WindRequest extends DantiRequest {
    type: "wind",
    data: string
}
export declare interface WindResponse {
    success: boolean
}

export declare interface OwnshipNameRequest extends DantiRequest {
    type: "ownship-name",
    data: string
}
export declare interface DaaUnitsResponse {
    success: boolean
}

export declare interface ConfigRequest extends DantiRequest {
    type: "config",
    data: string
}
export declare interface ConfigResponse {
    success: boolean
}

export declare interface StaleThresholdRequest extends DantiRequest {
    type: "stale-threshold",
    data: string
}
export declare interface StaleThresholdResponse {
    success: boolean
}

export declare interface EpochEndNotification extends DantiRequest {
    type: "epoch-end"
}

export declare interface DantiDataSourceInterface {
    /**
     * Sends traffic data to danti-server
     */
    sendTrafficData (data: string): Promise<boolean>;
    /**
     * Sends ownship data to danti-server
     */
    sendOwnshipData (data: string): Promise<boolean>;
    /**
     * Sends ownship name to danti-server
     */
    sendOwnshipName (data: string): Promise<boolean>;
    /**
     * Sends daa labels to danti-server
     */
    sendLabels (data: string): Promise<boolean>;
    /**
     * Sends daa units to danti-server
     */
    sendUnits (data: string): Promise<boolean>;
    /**
     * Sends wind data to danti-server
     */
    sendWind (data: string): Promise<boolean>;
}
export declare interface DantiWorkerInterface {
    /**
     * Sends traffic data to bands-worker
     */
    trafficData (data: string): Promise<string>;
    /**
     * Sends ownship data to bands-worker
     */
    ownshipData (data: string): Promise<string>;
    /**
     * Sends ownship name to bands-worker
     */
    ownshipName (data: string): Promise<string>;
    /**
     * Sends daa labels to bands-worker
     */
    labels (data: string): Promise<string>;
    /**
     * Sends daa units to bands-worker
     */
    units (data: string): Promise<string>;
    /**
     * Sends wind data to bands-worker
     */
    wind (data: string): Promise<string>;
}
/**
 * Traffic data, e.g., received from the ADS-B
 */
export interface TrafficData {
    name: string, // tail number
    lat: { val: string, units: string }, // latitude
    lon: { val: string, units: string }, // longitude
    alt: { val: string, units: string }, // altitude
    track: { val: string, units: string }, // true track
    heading?: { val: string, units: string }, // true heading
    magvar?: { val: string, units: string }, // magnetic variation
    gs: { val: string, units: string }, // true ground speed
    vspeed: { val: string, units: string }, // vertical speed
    wow: { val: string, units: string }, // weight on wheels
    time?: string, // current time
    toa: { val: string, units: string } // time of applicability
    error?: string // true indicates that an error occurred while reading the aircraft state
}
/**
 * Data received from the avionics of the ownship
 */
export interface AvionicsData extends TrafficData {
    ias: { val: string, units: string }, // indicated airspeed
    tas: { val: string, units: string } // true airspeed
}
export type AircraftData = AvionicsData | TrafficData;
/**
 * Utility function, generated a unique id
 */
export function uuid (format?: string) {
    let d: number = new Date().getTime();
    format = format || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
    const uuid = format.replace(/[xy]/g, (c: string) => {
        const r: number = ((d + Math.random() * 16) % 16) | 0;
        d = Math.floor(d / 16);
        return (c === 'x' ? r : (r & 0x7 | 0x8)).toString(16);
    });
    return uuid;
}
