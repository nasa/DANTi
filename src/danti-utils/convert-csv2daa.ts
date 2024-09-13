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
 * csv2daa is a tool for converting .csv data to .daa format.
 * 
 * .csv file:
 * - header with labels and units, in the form <label>_<units>, e.g., LATITUDE_DEG, GROUND_SPEED_KTS
 * - timestamps are given in a standard date-time format, e.g., 2023-12-10T07:17:03.47-08:00
 * - datapoints may be sparse (e.g., several seconds apart)
 * - datapoints may be not evenly spaced (e.g., several seconds apart or just few millis apart)
 * - datapoints may be incomplete (e.g., missing vs, trk, tail#)
 * 
 * .daa file:
 * - header with labels and units (1st line labels, 2nd line units)
 * - timestamps are given in seconds
 * - datapoints need to be syncronized
 * - datapoints need to be evenly spaced (typically, 1 second interval)
 * - datapoints need to include tail#, time, lat, lon, alt, trk, gs, vs
 * - the ownship needs to be the first datapoint
 * 
 * The csv2daa tool currently applies 6 filters to the .csv dataset:
 * Reduction filters: these filters are needed to create manageable .daa files from large datasets (300K lines)
 *      1. time limits (start and end time are those of the selected ownship)
 *      2. ground traffic suppression (barometric altitude = "ground")
 *      3. data split (the resulting dataset is split into files that contain a configurable amount of datapoint MAX_DAA_LINES)
 * Smoothing filters: these filters are needed to smooth data and fill "holes" in the dataset
 *      4. time adjustment (timestamps are rounded to the nearest second, this is done to simplify the computations necessary to generate synchronized datapoints for all aircraft)
 *      5. data interpolation (datapoints are evenly spaced to 1 second)
 *      6. trk/vs computation (when missing, track and vertical speed are computed based on current and previous lat lon alt data)
 * 
 * Additional filters that could be useful to add:
 * - compress multiple datapoints where the ownship is hovering into one datapoint (e.g., the ownship might be hovering for long periods of time and we are not interested in those datapoints)
 * - select aircraft tail numbers that we want to include/exclude from the .daa file (e.g., only a subset of the aircraft are actually participating in the scenario)
 * - consistency checks (e.g., ground speed vs lat lon changes, vertical speed vs alt changes)
 */

import { DaaAircraft, animateAircraft } from '../daa-displays/utils/daa-reader';
import { computeBearing } from '../daa-displays/daa-utils';
import * as fs from 'fs';

// the max number of lines the .daa file should contain
const MAX_DAA_LINES: number = 2000;

// mapping between csv labels and daa labels
const csv_labels_map: { [key: string]: string } = {
    "tail_number": "name", 
    "timestamp": "time",
    "latitude": "lat",
    "longitude": "lon",
    "altitude_baro": "alt",
    "ground_speed": "gs",
    "track_angle": "trk",
    "vertical_speed": "vs"
};
// const csv_units_map: { [key: string]: string } = {
//     "deg": "[deg]",
//     "ft": "[ft]",
//     "kts": "[knot]"
// };

/**
 * default labels and units of a .daa file
 */
export const LABELS: string = "name    time   lat     lon     alt     trk      gs     vs  ";
export const UNITS: string = "[none]   [s]   [deg]   [deg]    [ft]   [deg]   [knot]  [fpm]";

/**
 * Utility function, parses the altitude value indicated in the csv file -- either a number or "ground"
 */
function get_alt (data: string): string {
    return data === "ground" ? "0.0" : data;
}
/**
 * Utility function, parses the timestamp indicated in the csv file -- a date format
 */
function get_time (data: string): number {
    return new Date(data).getTime() / 1000;
}
/**
 * Utility function, prints the aircraft data in daa format
 */
function printAcSeriesLine (data: DaaAircraft, labels: string[]): string {
    if (data) {
        // console.log(data);
        let vals: string[] = [];
        for (let i = 0; i < labels.length; i++) {
            vals.push(data[labels[i].toLocaleLowerCase()]);
        }
        return vals.join(", ");
    }
    return "";
}

export type AcSeries = { [ ac: string ]: DaaAircraft[] };
/**
 * Utility function, converts structured plain text into json data
 */
function dataset2acseries (data: string, opt: { soloFlight: boolean, removeGroundTraffic: boolean, ownship: string, fname: string }): AcSeries {
    const lines: string[] = data?.trim()?.split("\n");
    if (lines?.length > 1) {
        // first line in the csv file contains labels+units
        // get labels, keep track of where the time column is
        let name_col: number = -1;
        let time_col: number = -1;
        let lat_col: number = -1;
        let lon_col: number = -1;
        let alt_col: number = -1;
        let gs_col: number = -1;
        let trk_col: number = -1;
        let vs_col: number = -1;
        lines[0].split(",").map((elem: string, index: number) => {
            elem = elem.toLocaleLowerCase();
            for (const i in csv_labels_map) {
                if (elem.startsWith(i)) {
                    if (i.startsWith("tail_number")) {
                        name_col = index;
                    } else if (i.startsWith("time")) {
                        time_col = index;
                    } else if (i.startsWith("lat")) {
                        lat_col = index;
                    } else if (i.startsWith("lon")) {
                        lon_col = index;
                    } else if (i.startsWith("altitude")) {
                        alt_col = index;
                    } else if (i.startsWith("ground_speed")) {
                        gs_col = index;
                    } else if (i.startsWith("track_angle")) {
                        trk_col = index;
                    } else if (i.startsWith("vertical_speed")) {
                        vs_col = index;
                    }
                }
            }
            return "???";
        });
        // sanity check
        if (time_col < 0 || lat_col < 0 || lon_col < 0 || gs_col < 0 || alt_col < 0) {
            console.error(`[csv2daa] Error: unable to find ${
                time_col < 0 ? "time" 
                : gs_col < 0 ? "gs" 
                : lat_col < 0 ? "lat" 
                : lon_col < 0 ? "lon"
                : "alt" 
            } column, aborting.`);
            return null;
        }
        const dataset: string[] = lines.slice(1);
        // build ac_series containing structured data
        console.log(`[csv2daa] Building ac_series (length=${dataset.length})`);
        const ac_series: AcSeries = {};
        const warnings: string[] = [];
        for (let i = 0; i < dataset.length; i++) {
            const name: string = dataset[i].split(",")[name_col];
            let alt: string = dataset[i].split(",")[alt_col];
            if (name.trim().length > 0 && (!opt?.soloFlight || name === opt?.ownship)) {
                const lat: string = dataset[i].split(",")[lat_col];
                const lon: string = dataset[i].split(",")[lon_col];
                const gs: string = dataset[i].split(",")[gs_col];
                const trk: string = trk_col >= 0 ? dataset[i].split(",")[trk_col] : "0";
                const vs: string = vs_col >= 0 ? dataset[i].split(",")[vs_col] : "0";
                if (name === opt?.ownship || !(opt?.removeGroundTraffic && alt === "ground")) {
                    alt = get_alt(alt);
                    const time: number = get_time(dataset[i].split(",")[time_col]);
                    ac_series[name] = ac_series[name] || [];
                    const daaAircraft: DaaAircraft = { name, time, lat, lon, alt, gs, vs, trk, roll: 0 };
                    ac_series[name].push(daaAircraft);
                }
            } else {
                if (alt !== "ground") {
                    warnings.push(`[csv2daa] Warning: Aircraft name not specified in dataset line ${i}: ${dataset[i]}`);
                }
            }
        }
        // sort dataset of each aircraft by time
        const tail_numbers: string[] = Object.keys(ac_series);
        for (let i = 0; i < tail_numbers.length; i++) {
            const name: string = tail_numbers[i];
            ac_series[name] = ac_series[name].sort((a, b: DaaAircraft) => {
                return +a.time - +b.time;
            });
        }
        // write errors if any
        if (opt?.fname && warnings.length) {
            fs.writeFileSync(`${opt?.fname}.err`, warnings.join("\n"));
        }
        return ac_series;
    }
    return null;
}
/**
 * Utility function, converts a daa file into json data
 */
function daa2acseries (data: string, opt: { soloFlight: boolean, removeGroundTraffic: boolean, ownship: string, fname: string }): AcSeries {
    const lines: string[] = data?.trim()?.split("\n");
    if (lines?.length > 1) {
        // first line in the csv file contains labels+units
        // get labels, keep track of where the time column is
        let name_col: number = -1;
        let time_col: number = -1;
        let lat_col: number = -1;
        let lon_col: number = -1;
        let alt_col: number = -1;
        let gs_col: number = -1;
        let trk_col: number = -1;
        let vs_col: number = -1;
        lines[0].split(",").map((elem: string, index: number) => {
            elem = elem.toLocaleLowerCase();
			switch (elem) {
				case "name": { name_col = index; break; }
				case "time": { time_col = index; break; }
				case "lat": { lat_col = index; break; }
				case "lon": { lon_col = index; break; }
				case "alt": { alt_col = index; break; }
				case "gs": { gs_col = index; break; }
				case "trk": { trk_col = index; break; }
				case "vs": { vs_col = index; break; }
				default: { console.warn(`Warning: unexpected label ${elem}`); }
			}
        });
        // sanity check
        if (time_col < 0 || lat_col < 0 || lon_col < 0 || gs_col < 0 || alt_col < 0) {
            console.error(`[daa2acseries] Error: unable to find ${
                time_col < 0 ? "time" 
                : gs_col < 0 ? "gs" 
                : lat_col < 0 ? "lat" 
                : lon_col < 0 ? "lon"
                : "alt" 
            } column, aborting.`);
            return null;
        }
        const dataset: string[] = lines.slice(1);
        // build ac_series containing structured data
        console.log(`[daa2acseries] Building ac_series (length=${dataset.length})`);
        const ac_series: AcSeries = {};
        const warnings: string[] = [];
        for (let i = 0; i < dataset.length; i++) {
            const name: string = dataset[i].split(",")[name_col];
            let alt: string = dataset[i].split(",")[alt_col];
            if (name.trim().length > 0 && (!opt?.soloFlight || name === opt?.ownship)) {
                const lat: string = dataset[i].split(",")[lat_col];
                const lon: string = dataset[i].split(",")[lon_col];
                const gs: string = dataset[i].split(",")[gs_col];
                const trk: string = trk_col >= 0 ? dataset[i].split(",")[trk_col] : "0";
                const vs: string = vs_col >= 0 ? dataset[i].split(",")[vs_col] : "0";
                if (name === opt?.ownship || !(opt?.removeGroundTraffic && +alt === 0)) {
                    alt = get_alt(alt);
                    const time: number = get_time(dataset[i].split(",")[time_col]);
                    ac_series[name] = ac_series[name] || [];
                    const daaAircraft: DaaAircraft = { name, time, lat, lon, alt, gs, vs, trk, roll: 0 };
                    ac_series[name].push(daaAircraft);
                }
            } else {
                if (+alt !== 0) {
                    warnings.push(`[daa2acseries] Warning: Aircraft name not specified in dataset line ${i}: ${dataset[i]}`);
                }
            }
        }
        // sort dataset of each aircraft by time
        const tail_numbers: string[] = Object.keys(ac_series);
        for (let i = 0; i < tail_numbers.length; i++) {
            const name: string = tail_numbers[i];
            ac_series[name] = ac_series[name].sort((a, b: DaaAircraft) => {
                return +a.time - +b.time;
            });
        }
        // write errors if any
        if (opt?.fname && warnings.length) {
            fs.writeFileSync(`${opt?.fname}.err`, warnings.join("\n"));
        }
        return ac_series;
    }
    return null;
}

/**
 * Utility function, computes trk and vs for the ac series
 */
function computeTrkVs (ac_series: AcSeries, ownship: string): AcSeries {
    const tail_numbers: string[] = ac_series ? Object.keys(ac_series) : [];
    if (!tail_numbers.includes(ownship)) {
        console.error(`[csv2daa] Ownship ${ownship} could not be found in the data series`);
        return null;
    }
    // get min and max timestamp for the given ownship
    const ownship_series: DaaAircraft[] = ac_series[ownship];
    const min_time: number = +ownship_series[0].time;
    const max_time: number = +ownship_series[ownship_series.length - 1].time;
    console.log({ ownship, min_time, max_time });
    const trkvs_ac_series: AcSeries = {};
    for (let i = 0; i < tail_numbers.length; i++) {
        const name: string = tail_numbers[i];
        console.log(`[csv2daa] Processing aircraft ${name} (${i + 1} of ${tail_numbers.length})`);
        const ac_data: DaaAircraft[] = ac_series[name];
        // Compute track based on lat lon
        const extended_ac_series: DaaAircraft[] = [];
        for (let i = 1; i < ac_data.length; i++) {
            const d0: DaaAircraft = ac_data[i - 1];
            const d1: DaaAircraft = ac_data[i];
            // console.log({ d0, d1 });
            const time_0: string | number = d0.time;
            const time_1: string | number = d1.time;
            if (+time_0 >= min_time && +time_0 <= max_time) {
                const lat_1: string = d1.lat.toString();
                const lon_1: string = d1.lon.toString();
                const lat_0: string = d0.lat.toString();
                const lon_0: string = d0.lon.toString();
                // compute trk
                const trk: number = (+d0.trk === 0) ? computeBearing({lat: +lat_0, lon: +lon_0 }, { lat: +lat_1, lon: +lon_1 }) : +d0.trk;
                const alt_1: string = d0.alt.toString();
                const alt_0: string = d1.alt.toString();
                // compute vs
                const vs: number = (+d0.vs === 0) ? (+alt_1 - +alt_0) / (+time_1 - +time_0) / 60 : +d0.vs; // alt is assumed to be in ft, time is in sec, vs is in ft/min
                extended_ac_series.push({
                    ...d0, vs, trk//, time: Math.round(+time_0)
                });
                // add final data point
                if (i === ac_data.length - 1) {
                    extended_ac_series.push({
                        ...d1, vs, trk//, time: Math.round(+time_1)
                    });
                }
            }
            // console.log(extended_ac_series);
        }
        trkvs_ac_series[name] = extended_ac_series;
    }
    return trkvs_ac_series;
}

/**
 * Utility function, adjusts the timestamp in the data series to integer values
 * Datapoints that are less than 1s apart are merged into a single datapoint (one datapoint is kept, the others are discarded) 
 */
function adjustTime (ac_series: AcSeries): AcSeries {
    const tail_numbers: string[] = ac_series ? Object.keys(ac_series) : [];
    const adjusted_ac_series: AcSeries = {};
    for (let i = 0; i < tail_numbers.length; i++) {
        const name: string = tail_numbers[i];
        const ac_data: DaaAircraft[] = ac_series[name];
        const adjusted_data: DaaAircraft[] = [];
        for (let i = 0; i < ac_data.length; i++) {
            const round_time: string = `${Math.round(+ac_data[i].time)}`;
            ac_data[i].time = round_time;
            if (adjusted_data.length && adjusted_data[adjusted_data.length - 1].time === round_time) {
                adjusted_data[adjusted_data.length - 1] = ac_data[i];
            } else {
                adjusted_data.push(ac_data[i]);
            }
        }
        adjusted_ac_series[name] = adjusted_data;
    }
    return adjusted_ac_series;
}

/**
 * Utility function, interpolates the data series so that data points are evenly spaced (1Hz)
 */
function interpolateAcSeries (ac_series: AcSeries): AcSeries {
    const tail_numbers: string[] = ac_series ? Object.keys(ac_series) : [];
    if (!tail_numbers.includes(ownship)) {
        console.error(`[csv2daa] Ownship ${ownship} could not be found in the data series`);
        return null;
    }
    const interpolated_ac_series: AcSeries = {};
    for (let i = 0; i < tail_numbers.length; i++) {
        // data frequency should be 1Hz -- fill the gaps in the data series if needed
        const name: string = tail_numbers[i];
        const ac_data: DaaAircraft[] = ac_series[name];
        // console.log(`[csv2daa] Interpolating missing datapoints for ${name}...`);
        // process each aircraft independently and save to full_ac_series, stay in the time range indicated for the ownship
        const interpolated_data: DaaAircraft[] = [];
        for (let i = 1; i < ac_data.length; i++) {
            const deltaTime: number = +ac_data[i].time - +ac_data[i - 1].time;
            // console.log({ deltaTime });
            if (deltaTime === 0) {
                if (interpolated_data.length === 0) {
                    // insert most recent datapoint
                    interpolated_data.push(ac_data[i]);
                } else {
                    // replace the last datapoint with the most recent
                    interpolated_data[interpolated_data.length - 1] = ac_data[i];
                }
            } else if (deltaTime > 1) {
                const animatedSeries: DaaAircraft[] = animateAircraft([ ac_data[i - 1], ac_data[i] ], deltaTime, { dbg_lines: false });
                interpolated_data.push(...animatedSeries.slice(0, animatedSeries.length - 1));
            } else {
                interpolated_data.push(ac_data[i - 1]);
            }
            // add last data point
            if (i === ac_data.length - 1) {
                interpolated_data.push(ac_data[i]);
            }
        }
        interpolated_ac_series[name] = interpolated_data;
    }
    return interpolated_ac_series;
}

/**
 * Utility function, converts ac series to DaaAircraft vector
 */
function acSeries2DaaData (ac_series: AcSeries, ownship: string): DaaAircraft[] {
    if (ac_series && ac_series[ownship]) {
        const daaData: DaaAircraft[] = [];
        const tail_numbers: string[] = Object.keys(ac_series);
        const traffic: string[] = tail_numbers.filter((name: string) => {
            return name !== ownship;
        });
        // put ownship data first -- this makes it easier to implement acSeries2DaaData (daa data needs to start with the ownship data)
        daaData.push(...ac_series[ownship]);
        // then put traffic data
        for (let i = 0; i < traffic.length; i++) {
            const name: string = traffic[i];
            daaData.push(...ac_series[name]);
        }
        // sort data by time
        return daaData.sort((a, b: DaaAircraft) => {
            return +a.time - +b.time;
        });
    }
    console.warn(`[csv2daa] Warning: unable to convert ac series to DaaAircraft[] (ownship ${ownship} not found in ac series)`);
    return null;
}

/**
 * Utility function, converts a .csv file into .daa
 * The cvs file is assumed to have the following columns:
 * TAIL_NUMBER, TIMESTAMP, LATITUDE_DEG, LONGITUDE_DEG, ALTITUDE_BARO_FT, GROUND_SPEED_KTS
 */
export function csv2daa (fname: string, ownship: string, opt?: { soloFlight: boolean }): boolean {
    if (fname && ownship) {
        console.log(`[csv2daa] Processing ${fname} ...`);
        const data: string = fs.readFileSync(fname).toLocaleString() || "";
        if (data) {
            // get ac series
            const ac_series: AcSeries = dataset2acseries(data, { removeGroundTraffic: true, soloFlight, ownship, fname });
            // console.log({ ac_series });
            // process each aircraft independently and save to full_ac_series, stay in the time range indicated for the ownship
            const trkvs_ac_series: AcSeries = computeTrkVs(ac_series, ownship);
            const integer_ac_series: AcSeries = adjustTime(trkvs_ac_series);
            const interpolated_ac_series: AcSeries = interpolateAcSeries(integer_ac_series);
            const daa_data: DaaAircraft[] = acSeries2DaaData(interpolated_ac_series, ownship);
            // convert to .daa
            console.log("[csv2daa] Converting to .daa format...");
            const daa_units: string = UNITS;
            const daa_labels: string = LABELS;
            let chunk: number = 0;
            let daaFile: string = `${fname}-${chunk < 10 ? `00${chunk}` : chunk < 100 ? `0${chunk}` : chunk}${opt.soloFlight ? "-solo" : ""}.daa`;
            let daaFileContent: string = daa_labels + "\n" + daa_units;
            let lineCount: number = 0;
            const regex: RegExp = new RegExp(/\s+/g);
            const labels: string[] = daa_labels.replace(regex, ",").split(",");
            for (let i = 0; i < daa_data.length; i++) {
                daaFileContent += "\n" + printAcSeriesLine(daa_data[i], labels);
                lineCount++;
                // each daa file should start with the ownship data
                if (lineCount > MAX_DAA_LINES 
                        && i + 1 < daa_data.length 
                        && daa_data[i + 1].name === ownship) {
                    fs.writeFileSync(daaFile, daaFileContent);
                    console.log(`[csv2daa] DAA file written: ${daaFile}`);
                    // increment chunk number
                    chunk++;
                    // update daa file name
                    daaFile = `${fname}-${chunk < 10 ? `00${chunk}` : chunk < 100 ? `0${chunk}` : chunk}${opt.soloFlight ? "-solo" : ""}.daa`;
                    // reset daa file content
                    daaFileContent = daa_labels + "\n" + daa_units;
                    // reset counter
                    lineCount = 0;
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
    return false;
}

// utility function, prints information on how to use the converter
export function help (): string {
    return `Usage:
node convert-csv2daa <file.csv> ownship=N858MH solo=false`;
}

// get args from command line
const args: string[] = process.argv?.slice(2);
console.log('args: ', args);
const ownship: string = args?.length > 1 && args[1] ? args[1] : "N858MH";
const soloFlight: boolean = args?.length > 2 && args[2] ? args[2] === "true" : false;
// TODO: add command line options for the following functions:
// - list ac names
// - select ownship name (this will put constraints on the timestamp range)
if (args?.length && args[0]) {
    csv2daa(args[0], ownship, { soloFlight });
} else {
    console.log(help());
}