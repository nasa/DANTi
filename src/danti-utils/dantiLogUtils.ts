/* eslint-disable no-useless-escape */
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

import { LatLonAlt, ValUnits } from "../daa-displays/utils/daa-types";
import * as fs from 'fs';
import { DEFAULT_LABELS } from "../daa-displays/utils/daa-reader";

// useful constants
export const MAX_DAA_LINES: number = 4000; // the max number of lines the .daa file should contain

// useful interface definitions
export interface FlightData {
    danti: string,
    ownship: AircraftLog
    traffic: AircraftLog[]
}
export interface AircraftLog extends LatLonAlt<ValUnits> {
    name: string,
    time: string,
    lat: ValUnits,
    lon: ValUnits,
    alt: ValUnits,
    airspeed: ValUnits,
    vspeed: ValUnits,
    heading: ValUnits
}
export interface InfoMsg {
    info: string
}
export type DantiLogLine = FlightData | InfoMsg;

// utility function, converts AircraftLog to .daa line
// cols are in the default order "NAME     lat          lon           alt          trk         gs           vs        time"
// see DEFAULT_LABELS in daa-reader.ts
export function aircraftLog2DaaData (ac: AircraftLog, opt?: { time?: string | number }): string {
    if (ac) {
        let res: string = ac.name + " "  + ac.lat?.val + " " + ac.lon?.val + " " + ac.alt?.val + " " 
                + ac.heading?.val + " " + ac.airspeed?.val + " " + ac.vspeed?.val + " ";
        res += isFinite(+opt?.time) ? +opt.time : ac.time;
        return res;
    }
    return "";
}

// utility function, extracts the units line of the .daa file from the AircraftLog
export function aircraftLog2DaaUnits (al: AircraftLog): string {
    if (al) {
        return "[none]" + " ["  + al.lat?.units + "] [" + al.lon?.units + "] [" + al.alt?.units + "] [" 
                + al.heading?.units + "] [" + al.airspeed?.units + "] [" + al.vspeed?.units + "] " +  "[ms]";
    }
    return "";
}

// utility function, converts danti log line to .daa data lines
export function dantiLogLine2DaaDataLines (logLine: string, opt?: { adjustTime?: boolean }): string {
    try {
        const data: DantiLogLine = JSON.parse(logLine);
        // parse content only if the ownship data is present
        if (data["ownship"]) {
            // print ownship data
            let daa: string = aircraftLog2DaaData((<FlightData> data).ownship);
            // print traffic data
            for (let i = 0; i < (<FlightData> data).traffic?.length; i++) {
                daa += "\n" + aircraftLog2DaaData((<FlightData> data).traffic[i], { time: opt?.adjustTime ? (<FlightData> data).ownship.time : NaN });
            }
            return daa;
        }
    } catch (err) {
        console.warn(`[log-converter] Warning: skipping line (invalid JSON structure)`, { line: logLine });
    }
    return "";
}

// utility function, converts danti log line to a .daa units line
export function dantiLogLine2DaaUnitsLine (logLine: string): string {
    try {
        const data: DantiLogLine = JSON.parse(logLine);
        // parse content only if the ownship data is present
        if (data["ownship"]) {
            // print units, the assumption is that the units won't change throughout the log
            const daa: string = aircraftLog2DaaUnits((<FlightData> data).ownship);
            return daa;
        }
    } catch (err) {
        console.warn(`[log-converter] Warning: skipping line (invalid JSON structure)`, { line: logLine });
    }
    return "";
}

// main function, converts a danti log file to a daa file
export function dantiLog2DaaFile (fname: string, opt?: { adjustTime?: boolean }): boolean {
    if (fname) {
        console.log(`[log-converter] Processing ${fname} ...`);
        const data: string = fs.readFileSync(fname)?.toLocaleString() || "";
        if (data) {
            const lines: string[] = data.split("\n").filter(elem => {
                // the ownship must have a name
                return /"ownship"\s*:\s*{\s*"name"\s*:\s*"[^\"]+"/g.test(elem);
            }) || [];
            if (lines?.length > 0) {
                const labels: string = DEFAULT_LABELS;
                const units: string = dantiLogLine2DaaUnitsLine(lines[0]);
                let chunk: number = 0;
                let daaFile: string = `${fname}-${chunk < 10 ? `00${chunk}` : chunk < 100 ? `0${chunk}` : chunk}.daa`;
                let daaFileContent: string = labels + "\n" + units;
                for (let i = 0; i < lines.length; i++) {
                    daaFileContent += "\n" + dantiLogLine2DaaDataLines(lines[i], opt);
                    if (daaFileContent.split("\n").length > MAX_DAA_LINES) {
                        fs.writeFileSync(daaFile, daaFileContent);
                        console.log(`[log-converter] DAA file written: ${daaFile}`);
                        // increment chunk number
                        chunk++;
                        // update daa file name
                        daaFile = `${fname}-${chunk < 10 ? `00${chunk}` : chunk < 100 ? `0${chunk}` : chunk}.daa`;
                        // reset daa file content
                        daaFileContent = labels + "\n" + units;
                    }
                }
                fs.writeFileSync(daaFile, daaFileContent);
                console.log(`[log-converter] DAA file written: ${daaFile}`);
                return true;
            } else {
                console.warn(`[log-converter] Nothing to do (ownship data is null)`);
                return false;
            }
        }
        console.warn(`[log-converter] Nothing to do (empty data file)`);
    }
    return false;
}