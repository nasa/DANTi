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
 * 
 * @author Paolo Masci AMA-NASA LaRC
 * @date 03.01.2024
 */

import { computeBearing } from '../daa-displays/daa-utils';
import * as fs from 'fs';

/**
 * Utility function, converts a .csv file into .daa
 * The cvs file is assumed to have the following columns:
 * TAIL_NUMBER, TIMESTAMP, LATITUDE_DEG, LONGITUDE_DEG, ALTITUDE_BARO_FT, GROUND_SPEED_KTS
 */
export function csv2daa (fname: string): boolean {
    // mapping between csv labels and daa labels
    const csv_labels_map: { [key: string]: string } = {
        "tail_number": "name", 
        "timestamp": "time",
        "latitude": "lat",
        "longitude": "lon",
        "altitude_baro": "alt",
        "ground_speed": "gs"
    };
    const csv_units_map: { [key: string]: string } = {
        "deg": "[deg]",
        "ft": "[ft]",
        "kts": "[knot]"
    };
    const MAX_DAA_LINES: number = 4000; // the max number of lines the .daa file should contain
    if (fname) {
        console.log(`[csv2daa] Processing ${fname} ...`);
        const data: string = fs.readFileSync(fname).toLocaleString() || "";
        if (data) {
            const lines: string[] = data.split("\n");
            if (lines?.length > 1) {
                // first line contains labels+units
                // get labels, keep track of where the time column is
                let time_col: number = -1;
                let lat_col: number = -1;
                let lon_col: number = -1;
                const labels: string = lines[0].split(",").map((elem: string, index: number) => {
                    elem = elem.toLocaleLowerCase();
                    for (const i in csv_labels_map) {
                        if (elem.startsWith(i)) {
                            if (i.startsWith("time")) {
                                time_col = index;
                            } else if (i.startsWith("lat")) {
                                lat_col = index;
                            } else if (i.startsWith("lon")) {
                                lon_col = index;
                            }
                            return csv_labels_map[i];
                        }
                    }
                    return "???";
                }).join("   ");
                // get units
                const units: string = lines[0].split(",").map((elem: string) => {
                    elem = elem.toLocaleLowerCase();
                    for (const i in csv_units_map) {
                        if (elem.endsWith(`_${i}`)) {
                            return csv_units_map[i];
                        }
                    }
                    return elem.startsWith("time") ? "[s]" : "[none]";
                }).join("  ");
                console.log({ labels, units });
                // sanity check
                if (time_col < 0 || lat_col < 0 || lon_col < 0) {
                    console.error(`[csv2daa] Error: unable to find ${time_col < 0 ? "time" : lat_col < 0 ? "lat" : "lon" } column, aborting.`);
                    return false;
                }
                // sort data based on the timestamp
                console.log("[csv2daa] Sorting data by timestamp...");
                const sorted_lines: string[] = lines.slice(1).sort((a, b: string) => {
                    const time_a: number = new Date(a.split(",")[time_col]).getTime();
                    const time_b: number = new Date(b.split(",")[time_col]).getTime();
                    return time_a - time_b;
                });
                // get base time
                const base_time: number = new Date(sorted_lines[1].split(",")[time_col]).getTime();
                console.log("[csv2daa] Base time: " + base_time + " [ms]");
                // add track info
                console.log("[csv2daa] Computing track based on lat lon... ");
                const extended_labels: string = labels + "   trk        vs";
                const extended_units: string = units + " [deg]     [fpm]";
                const extended_lines: string[] = [];
                for (let i = 1; i < sorted_lines.length; i++) {
                    const lat_1: number = +sorted_lines[i].split(",")[lat_col];
                    const lon_1: number = +sorted_lines[i].split(",")[lon_col];
                    const lat_0: number = +sorted_lines[i - 1].split(",")[lat_col];
                    const lon_0: number = +sorted_lines[i - 1].split(",")[lon_col];
                    const track: number = computeBearing({lat: lat_0, lon: lon_0 }, { lat: lat_1, lon: lon_1 });
                    const vs: number = 0; // vs is not computed for now
                    extended_lines.push(sorted_lines[i] + "," + track + "," + vs);
                }
                // convert to .daa
                console.log("[csv2daa] Converting to .daa format...");
                let chunk: number = 0;
                let daaFile: string = `${fname}-${chunk < 10 ? `00${chunk}` : chunk < 100 ? `0${chunk}` : chunk}.daa`;
                let daaFileContent: string = extended_labels + "\n" + extended_units;
                for (let i = 0; i < extended_lines.length; i++) {
                    daaFileContent += "\n" + extended_lines[i].split(",").map((elem: string, index: number) => {
                        if (time_col >= 0 && time_col === index) {
                            return (new Date(elem).getTime() - base_time) / 1000;
                        }
                        return elem === "ground" ? "0.0" : elem.trim();
                    }).join(", ");
                    if (daaFileContent.split("\n").length > MAX_DAA_LINES) {
                        fs.writeFileSync(daaFile, daaFileContent);
                        console.log(`[csv2daa] DAA file written: ${daaFile}`);
                        // increment chunk number
                        chunk++;
                        // update daa file name
                        daaFile = `${fname}-${chunk < 10 ? `00${chunk}` : chunk < 100 ? `0${chunk}` : chunk}.daa`;
                        // reset daa file content
                        daaFileContent = extended_labels + "\n" + extended_units;
                    }
                }
                fs.writeFileSync(daaFile, daaFileContent);
                console.log(`[csv2daa] DAA file written: ${daaFile}`);
                return true;
            } else {
                console.warn(`[csv2daa] Nothing to do (csv files is empty)`);
                return false;
            }
        }
        console.warn(`[log-converter] Nothing to do (empty data file)`);
    }
    return false;
}


// utility function, prints information on how to use the converter
export function help (): string {
    return `Usage:
node convert-csv2daa <file.csv>`;
}

// get args from command line
const args: string[] = process.argv?.slice(2);
console.log('args: ', args);
if (args?.length && args[0]) {
    csv2daa(args[0]);
} else {
    console.log(help());
}