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
 * @date 09.10.2024
 * fix-daa is a tool for fixing daa files with data gaps into well-formed daa files using linear interpolation.
 * 
 * .daa file:
 * - header with labels and units (1st line labels, 2nd line units)
 * - timestamps are given in seconds
 * - datapoints need to be syncronized
 * - datapoints need to be evenly spaced (typically, 1 second interval)
 * - datapoints need to include tail#, time, lat, lon, alt, trk, gs, vs
 * - the ownship needs to be the first datapoint
 * 
 * The tool can apply 6 filters:
 * Reduction filters: these filters are needed to create manageable .daa files from large datasets (300K lines)
 *      1. time limits (start and end time are those of the selected ownship)
 *      2. ground traffic suppression (altitude = 0)
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
import { exit } from 'node:process';

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
let UNITS: string = "[none]   [s]   [deg]   [deg]    [ft]   [deg]   [knot]  [fpm]";

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
 * Utility function, prints the header lines of the daa file (labels+units)
 */
function printUnits (data: string, col: {
	time_col: number, lat_col: number, lon_col: number, alt_col: number, trk_col: number, gs_col: number, vs_col: number
}): string {
	const lines: string[] = data?.trim()?.split("\n");
	if (lines?.length > 1) {
		const time_units: string = lines[1].split(",")[col.time_col];
		const lat_units: string = lines[1].split(",")[col.lat_col];
		const lon_units: string = lines[1].split(",")[col.lon_col];
		const alt_units: string = lines[1].split(",")[col.alt_col];
		const trk_units: string = lines[1].split(",")[col.trk_col];
		const gs_units: string = lines[1].split(",")[col.gs_col];
		const vs_units: string = lines[1].split(",")[col.vs_col];
		return `[none]   ${time_units}   ${lat_units}   ${lon_units}    ${alt_units}   ${trk_units}   ${gs_units}  ${vs_units}`;
	}
	return "## INVALID HEADER ##";
}
/**
 * Utility function, converts a daa file into json data
 */
function daa2acseries (data: string, opt: { soloFlight: boolean, removeGroundTraffic: boolean, ownship: string, fname: string }): AcSeries {
    const lines: string[] = data?.trim()?.split("\n");
    if (lines?.length > 2) {
        // first line in the daa file contains labels
		// second line contains units
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
            elem = elem.toLocaleLowerCase().trim();
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
        const dataset: string[] = lines.slice(2); // the first two lines are header lines
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
                    const time: string = dataset[i].split(",")[time_col];
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
		// update units
		console.log("[daa2acseries] setting labels and units...");
		UNITS = printUnits(data, { time_col, lat_col, lon_col, alt_col, gs_col, trk_col, vs_col });	
		// return the series
        return ac_series;
    }
    return null;
}

/**
 * Utility function, computes trk and vs for the ac series and keeps only traffic data relevant for the ownship timestamps
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
                if (i === ac_data.length - 1 && +time_1 >= min_time && +time_1 <= max_time) {
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
function interpolateAcSeries (ac_series: AcSeries, ownship?: string, opt?: { trafficInterpolation?: boolean }): AcSeries {
	opt = opt || {};
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
		// interpolate the ownship or interpolate all aircraft if opt.interpolateTraffic is true
		if ((ownship && name === ownship || opt?.trafficInterpolation)) {
			console.log(`[csv2daa] Interpolating missing datapoints for ${name}...`);
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
		} else {
			// do not interpolate, leave data as it is
			interpolated_ac_series[name] = ac_series[name];
		}
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
 * Utility function used by fixDaa to generate the output file name based on the value of given state variables
 */
function getOutputFileName (fname: string, chunk: number, soloFlight: boolean): string {
	return `${fname.substring(0, fname.lastIndexOf("."))}_${ownship}-${chunk < 10 ? `00${chunk}` : chunk < 100 ? `0${chunk}` : chunk}${soloFlight ? "-solo" : ""}.daa`;
}

/**
 * Utility function, fixes a daa file with gaps in the datapoints
 */
export function fixDaa (fname: string, ownship: string, opt?: { soloFlight?: boolean, trafficInterpolation?: boolean, maxlines?: number }): boolean {
    if (fname && ownship) {
        console.log(`[fixDaa] Processing ${fname} ...`);
        const data: string = fs.readFileSync(fname).toLocaleString() || "";
        if (data) {
			// remove lines commented with #
			const clean_data: string = data.replace(/^\s*#.*/g, "");
            // get ac series
            const ac_series: AcSeries = daa2acseries(clean_data, { removeGroundTraffic: true, soloFlight, ownship, fname });
            // process each aircraft independently and save to full_ac_series, stay in the time range indicated for the ownship
            const trkvs_ac_series: AcSeries = computeTrkVs(ac_series, ownship);
            const integer_ac_series: AcSeries = adjustTime(trkvs_ac_series);
            const interpolated_ac_series: AcSeries = interpolateAcSeries(integer_ac_series, ownship, opt);
            const daa_data: DaaAircraft[] = acSeries2DaaData(interpolated_ac_series, ownship);
			const maxlines: number = opt?.maxlines > 0 ? opt.maxlines : 0;
            // convert to .daa
            console.log("[fixDaa] Filling .daa gaps...");
            const daa_units: string = UNITS;		
            const daa_labels: string = LABELS;
            let chunk: number = 0;
            let daaFile: string = getOutputFileName(fname, chunk, opt.soloFlight);
            let daaFileContent: string = daa_labels + "\n" + daa_units;
            let lineCount: number = 0;
            const regex: RegExp = new RegExp(/\s+/g);
            const labels: string[] = daa_labels.replace(regex, ",").split(",");
            for (let i = 0; i < daa_data.length; i++) {
                daaFileContent += "\n" + printAcSeriesLine(daa_data[i], labels);
                lineCount++;
                // each daa file should start with the ownship data
                if (maxlines > 0 && lineCount > maxlines 
                        && i + 1 < daa_data.length 
                        && daa_data[i + 1].name === ownship) {
                    fs.writeFileSync(daaFile, daaFileContent);
                    console.log(`[fixDaa] DAA file written: ${daaFile}`);
                    // increment chunk number
                    chunk++;
                    // update daa file name
                    daaFile = getOutputFileName(fname, chunk, opt.soloFlight);
                    // reset daa file content
                    daaFileContent = daa_labels + "\n" + daa_units;
                    // reset counter
                    lineCount = 0;
                }
            }
            fs.writeFileSync(daaFile, daaFileContent);
            console.log(`[fixDaa] DAA file written: ${daaFile}`);
            return true;
        } else {
            console.warn(`[fixDaa] Nothing to do (daa files is empty)`);
            return false;
        }
    }
    return false;
}


// utility function, prints information on how to use the converter
export function help (): string {
    return `Usage:
node fix-daa <file.daa> <ownship> <maxlines> <solo> <interpolateTraffic>

Example:
node fix-daa NYC.daa N858MH 2000 false false`;
}

// get args from command line
const args: string[] = process.argv?.slice(2);
console.log('args: ', args);
if (args.length < 4) {
	help();
	exit(1);
}
const ownship: string = args[1];
const maxlines: number = +args[2];
const soloFlight: boolean = args[3] === "true";
const trafficInterpolation: boolean = args[4] === "true"; // default is false
// TODO: add command line options for the following functions:
// - list ac names
// - select ownship name (this will put constraints on the timestamp range)
if (args?.length && args[0]) {
	fixDaa(args[0], ownship, { soloFlight, trafficInterpolation, maxlines });
} else {
	console.log(help());
}