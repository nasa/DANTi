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
import * as conversions from '../daa-displays/utils/daa-math';
import * as fs from 'fs';

// max number of lines the .daa file should contain. 
// Large numbers (> 20K) cause long processing times and possibly out of memory errors
// Use MAX_LINES = 0 to disable this feature and convert everything into one file regardless of the length
const MAX_DAA_LINES: number = 20000;

// aliases for daa header values, all lowercase
const name_header: string[] = [ "name", "aircraft", "id", "tail_number" ];
const time_header: string[] = [ "time", "tm", "clock", "st", "timestamp", "reporttime" ];
// ownship track, lat, lon, alt, gs, vs
const trk_header: string[] = [ "trk", "track" ];
const lat_header: string[] = [ "lat", "latitude", "ownlatdeg" ];
const lon_header: string[] = [ "lon", "long", "longitude", "ownlondeg" ];
const alt_header: string[] = [ "alt", "altitude", "altitude_baro", "ownalthaeft" ];
const gs_header: string[] = [ "gs", "groundspeed", "groundspd", "ground_speed" ];
const gs_EW_header: string[] = [ "ownvelewkts" ];
const gs_NS_header: string[] = [ "ownvelnskts" ];
const vs_header: string[] = [ "vs", "verticalspeed", "hdot", "vertical_speed", "ownaltratefps" ];
// traffic lat, lon, alt -- when these columns are present, then the csv file contains ownship and traffic data on the same line
const traffic_lat_header: string[] = [ "intruderlatdeg" ];
const traffic_lon_header: string[] = [ "intruderlondeg" ];
const traffic_alt_header: string[] = [ "intruderaltft" ];
const traffic_dist_NS: string[] = [ "intruderdistnsft" ];
const traffic_dist_EW: string[] = [ "intruderdistewft" ];

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
 * Utility function, parses the timestamp indicated in the csv file -- supports both date format and direct number in seconds
 */
function get_time (data: string): number {
    const time: number = +data;
	const date_time: number = +(new Date(data).getTime() / 1000);
	return !isNaN(time) ? time : date_time;
}
/**
 * Utility function, return gs value in knots. The value is given by column gs_col if gs_col >= 0 otherwise gs is computed from gs_NS and gs_EW
 * gs = sqrt(gs_NS^2 + gs_EW^2)
 * gs_EW = gs * math.sin(3.14 / 180 * trk)
 * gs_NS = gs * math.cos(3.14 / 180 * trk)
 */
function get_gs(cols: number[] | string[], gs_col: number, gs_EW_col: number, gs_NS_col: number): number {
	if (cols) {
		if (gs_col >=0 && gs_col < cols.length) { return +cols[gs_col]; }
		// otherwise try to compute gs
		if (gs_EW_col >=0 && gs_NS_col >= 0 && gs_EW_col < cols.length && gs_NS_col < cols.length) {
			return Math.sqrt(+cols[gs_EW_col] * +cols[gs_EW_col] + +cols[gs_NS_col] * +cols[gs_NS_col])
		}
	}
	return NaN;
}
/**
 * Utility function, return trk value in deg. The value is given by column trk_col if trk_col >= 0 otherwise trk is computed from gs_NS and gs_EW
 * trk = math.atan2(y,x) where y = gs_EW and x = gs_NS (in aviation, 0 deg is north, 90 is east, 180 is south, 270 is west)
 * gs_EW = gs * math.sin(3.14 / 180 * trk)
 * gs_NS = gs * math.cos(3.14 / 180 * trk)
 */
function get_trk(cols: number[] | string[], trk_col: number, gs_EW_col: number, gs_NS_col: number): number {
	if (cols) {
		if (trk_col >=0 && trk_col < cols.length) { return +cols[trk_col]; }
		// otherwise try to compute trk
		if (gs_EW_col >=0 && gs_NS_col >= 0 && gs_EW_col < cols.length && gs_NS_col < cols.length) {
			const trk_rad: number = Math.atan2(+cols[gs_EW_col], +cols[gs_NS_col]);
			const trk_deg: number = conversions.rad2deg(trk_rad);
			// console.log(`[convert-csv2daa] computing trk from velocity vector. trk = ${trk_deg} deg (${trk_rad} rad)`);
			return trk_deg;
		}
	}
	// if trk is not provided, we artificially set it to 0
	return 0;
}
/**
 * Utility function, prints the aircraft data in daa format
 */
function printAcSeriesLine (data: DaaAircraft, labels: string[]): string {
    if (data) {
        // console.log(data);
        let vals: string[] = [];
        for (let i = 0; i < labels.length; i++) {
            vals.push(data[ labels[i].toLocaleLowerCase() ]);
        }
		const result: string = vals.join(", ");
        return result;
    }
    return "";
}

export type AcSeries = { [ ac: string ]: DaaAircraft[] };

/**
 * Utility function, returns a list of aliases for the given column name
 */
function alias (col_name: string): string {
	if (col_name) {
		if (name_header.includes(col_name.toLocaleLowerCase())) { return "name"; }
		if (time_header.includes(col_name.toLocaleLowerCase())) { return "time"; }
		if (lat_header.includes(col_name.toLocaleLowerCase())) { return "lat"; }
		if (lon_header.includes(col_name.toLocaleLowerCase())) { return "lon"; }
		if (alt_header.includes(col_name.toLocaleLowerCase())) { return "alt"; }
		if (trk_header.includes(col_name.toLocaleLowerCase())) { return "trk"; }
		if (gs_header.includes(col_name.toLocaleLowerCase())) { return "gs"; }
		if (gs_NS_header.includes(col_name.toLocaleLowerCase())) { return "gs_NS"; }
		if (gs_EW_header.includes(col_name.toLocaleLowerCase())) { return "gs_EW"; }
		if (vs_header.includes(col_name.toLocaleLowerCase())) { return "vs"; }
		if (traffic_lat_header.includes(col_name.toLocaleLowerCase())) { return "traffic_lat"; }
		if (traffic_lon_header.includes(col_name.toLocaleLowerCase())) { return "traffic_lon"; }
		if (traffic_alt_header.includes(col_name.toLocaleLowerCase())) { return "traffic_alt"; }
		if (traffic_dist_NS.includes(col_name.toLocaleLowerCase())) { return "traffic_dist_NS"; }
		if (traffic_dist_EW.includes(col_name.toLocaleLowerCase())) { return "traffic_dist_EW"; }
	}
	return "???"
}

/**
 * Utility function, converts structured plain text into json data
 */
function dataset2acseries (data: string, opt: { soloFlight: boolean, airborneOwnship?: boolean, removeGroundTraffic: boolean, ownship: string, fname: string }): AcSeries {
    const lines: string[] = data?.trim()?.split("\n");
    if (lines?.length > 1) {
        // first line in the csv file contains labels+units
        // get labels, keep track of where the time column is
		// ownship data
        let name_col: number = -1;
        let time_col: number = -1;
        let lat_col: number = -1;
        let lon_col: number = -1;
        let alt_col: number = -1;
        let gs_col: number = -1;
		let gs_EW_col: number = -1;
		let gs_NS_col: number = -1;
        let trk_col: number = -1;
        let vs_col: number = -1;
		// traffic data
        let traffic_name_col: number = -1;
        let traffic_lat_col: number = -1;
        let traffic_lon_col: number = -1;
        let traffic_alt_col: number = -1;
        let traffic_dist_EW_col: number = -1;
		let traffic_dist_NS_col: number = -1;

		// If the header contains "numIntruders" then this is traffic data received by the ownship.
		// Each line includes both traffic data and ownship data.
		// The name column is the traffic name. The ownship name is implicit in the data, and we need to use the ownship name passed as argument, if available.
		// For example, the .csv file fan contain the following columns:
		// id,
		// reportTime,
		// r_ground_ft,
		// bearing_rel_rad, # ownship heading ?
		// warningExists,
		// numIntruders,
		// ownLatdeg,
		// ownLondeg,
		// ownAltHaeft, # ownship height above the ellipsoid
		// ownVelEWkts, # gs component
		// ownVelNSkts, # gs component
		// ownAltRatefps, # vspeed
		// bearingTruedeg, # ownship heading ?
		// intruderDistNSft,
		// intruderDistEWft,
		// intruderLatdeg,
		// intruderLondeg,
		// intruderAltft
		const name_is_traffic: boolean = lines[0].includes("numIntruders");
        lines[0].split(",").map((elem: string, index: number) => {
            elem = elem.trim().toLocaleLowerCase();
			const col_name: string = alias(elem);
			console.log("elem = " + elem);
			console.log("col_name = " + col_name);
			switch (col_name) {
				case "name": {
					if (name_is_traffic) {
						traffic_name_col = index;
					} else {
						name_col = index;
					}
					break;
				}
				case "time": { time_col = index; break; }
				case "lat": { lat_col = index; break; }
				case "lon": { lon_col = index; break; }
				case "alt": { alt_col = index; break; }
				case "trk": { trk_col = index; break; }
				case "gs": { gs_col = index; break; }
				case "gs_EW": { gs_EW_col = index; break; }
				case "gs_NS": { gs_NS_col = index; break; }
				case "vs": { vs_col = index; break; }
				case "traffic_lat": { traffic_lat_col = index; break; }
				case "traffic_lon": { traffic_lon_col = index; break; }
				case "traffic_alt": { traffic_alt_col = index; break; }
				case "traffic_dist_NS": { traffic_dist_NS_col = index; break; }
				case "traffic_dist_EW": { traffic_dist_EW_col = index; break; }
				default: // do nothing, unsupported column name
			}
        });
        // sanity check
        if ((name_col < 0 && traffic_name_col < 0) || time_col < 0 || lat_col < 0 || lon_col < 0 
			|| (gs_col < 0 && gs_EW_col < 0 && gs_NS_col < 0) 
			|| (trk_col < 0 && gs_EW_col < 0 && gs_NS_col < 0) 
			|| alt_col < 0) {
            console.error(`[csv2daa] Error: unable to find ${
                (name_col < 0 && traffic_name_col < 0) ? "name"
				: time_col < 0 ? "time" 
                : (gs_col < 0 && gs_EW_col < 0 && gs_NS_col < 0) ? "gs" 
				: (trk_col < 0 && gs_EW_col < 0 && gs_NS_col < 0) ? "trk"
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
		if (name_is_traffic) {
			console.log(`[csv2daa] ADS-B data from ownship ${opt?.ownship}`);
			for (let i = 0; i < dataset.length; i++) {
				const cols: string[] = dataset[i].split(",");
				// console.log({ cols });
				const time: number = get_time(cols[time_col]);
				// collect traffic data
				const traffic_name: string = isFinite(+cols[traffic_name_col]) ? `AC${cols[traffic_name_col]}` : cols[traffic_name_col]; // if the name of the aircraft is a number, then use the format AC<num> to facilitate understanding/readability of the aircraft name during playback
				const traffic_lat: string = cols[traffic_lat_col];
				const traffic_lon: string = cols[traffic_lon_col];
				const traffic_alt: string = cols[traffic_alt_col];
				// TODO: compute gs, trk, vs using the available cols (traffic_dist_NS, traffic_dist_EW, etc.)
				const traffic_gs: number = 0.1; // using 0.1 here so trk can be computed from the velocity vector
				const traffic_trk: number = 0;
				const traffic_vs: number = 0;
				// add traffic data to ac_series
				ac_series[traffic_name] = ac_series[traffic_name] || [];
				if (!opt?.soloFlight && (traffic_gs > 0 || !opt?.removeGroundTraffic)) {
					const daaAircraft: DaaAircraft = {
						name: traffic_name, time, 
						lat: traffic_lat, lon: traffic_lon, alt: traffic_alt, 
						gs: traffic_gs, vs: traffic_vs, trk: traffic_trk, roll: 0
					};
					ac_series[traffic_name].push(daaAircraft);
				}

				// collect ownship data
				const ownship_name: string = opt?.ownship || "ownship";
				const ownship_lat: string = cols[lat_col];
				const ownship_lon: string = cols[lon_col];
				const ownship_gs: number = get_gs(cols, gs_col, gs_EW_col, gs_NS_col);
				const ownship_alt: string = ownship_gs === 0 ? "0" : cols[alt_col]; // set the altitude to 0 when the ownship is not airborne
				const ownship_trk: number = get_trk(cols, trk_col, gs_EW_col, gs_NS_col);
				const ownship_vs: string = cols[vs_col];
				// add ownship data to ac_series
				ac_series[ownship_name] = ac_series[ownship_name] || [];
				// if the ownship altitude is less than 0 and gs > 0 then we assume the ownship is taxing on the ground
				if ((ac_series[ownship_name]?.length > 0) || (ownship_gs > 0 || !opt?.airborneOwnship) && +ownship_alt > 0) {
					const daaOwnshipAircraft: DaaAircraft = {
						name: ownship_name, time, 
						lat: ownship_lat, lon: ownship_lon, alt: ownship_alt,
						gs: ownship_gs, vs: ownship_vs, trk: ownship_trk, roll: 0
					};
					ac_series[ownship_name].push(daaOwnshipAircraft);
				}
			}
		} else {
			for (let i = 0; i < dataset.length; i++) {
				const cols: string[] = dataset[i].split(",");
				// console.log({ cols });
				const name: string = cols[name_col];
				let alt: string = cols[alt_col];
				// if the name is indicated, then continue collecting the information
				if (name.trim().length > 0 && (!opt?.soloFlight || name === opt?.ownship)) {
					const lat: string = cols[lat_col];
					const lon: string = cols[lon_col];
					const gs: number = get_gs(cols, gs_col, gs_EW_col, gs_NS_col);
					const trk: number = get_trk(cols, trk_col, gs_EW_col, gs_NS_col);
					const vs: string = vs_col >= 0 ? cols[vs_col] : "0";
					if (name === opt?.ownship || !(opt?.removeGroundTraffic && alt === "ground")) {
						alt = get_alt(alt);
						const time: number = get_time(cols[time_col]);
						ac_series[name] = ac_series[name] || [];
						const daaAircraft: DaaAircraft = { name, time, lat, lon, alt, gs, vs, trk, roll: 0 };
						ac_series[name].push(daaAircraft);
					}
				} else {
					// otherwise, print a warning if the aircraft is not on the ground
					if (alt !== "ground") {
						warnings.push(`[csv2daa] Warning: Aircraft name not specified in dataset line ${i}: ${dataset[i]}`);
					}
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
 * Utility function, clips the ac_series to the times when the ownship is present and computes trk and vs for the ac series
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
		// console.log("ac_data.length = " + ac_data.length);
		if (ac_data.length > 1) {
			for (let t = 1; t < ac_data.length; t++) {
				const d0: DaaAircraft = ac_data[t - 1];
				const d1: DaaAircraft = ac_data[t];
				// console.log({ d0, d1 });
				const time_0: string | number = d0.time;
				const time_1: string | number = d1.time;
				// console.log({ time_0, time_1, min_time, max_time });
				if (+time_0 >= min_time && +time_0 <= max_time) {
					const lat_1: string = d1.lat.toString();
					const lon_1: string = d1.lon.toString();
					const lat_0: string = d0.lat.toString();
					const lon_0: string = d0.lon.toString();
					// compute trk
					const trk: number = (+d0.trk === 0) ? computeBearing({ lat: +lat_0, lon: +lon_0 }, { lat: +lat_1, lon: +lon_1 }) : +d0.trk;
					// console.log({ trk });
					const alt_1: string = d0.alt.toString();
					const alt_0: string = d1.alt.toString();
					// compute vs
					const vs: number = (+d0.vs === 0) ? (+alt_1 - +alt_0) / (+time_1 - +time_0) / 60 : +d0.vs; // alt is assumed to be in ft, time is in sec, vs is in ft/min
					extended_ac_series.push({
						...d0, vs, trk//, time: Math.round(+time_0)
					});
					// add final data point
					if (t === ac_data.length - 1) {
						extended_ac_series.push({
							...d1, vs, trk//, time: Math.round(+time_1)
						});
					}
				}
			}
		} else if (ac_data?.length > 0) {
			// add the only datapoint available
			const d: DaaAircraft = ac_data[0];
			const time: string | number = d.time;
			if (+time >= min_time && +time <= max_time) {
				const trk: number = 0; //+d?.trk; -- setting to 0, as there's only one datapoint so it does not really matter
				const vs: number = 0; //+d?.vs; -- setting to 0, as there's only one datapoint so it does not really matter
				extended_ac_series.push({
					...d, vs, trk
				});
			}
		}
		// else, the series is empty
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
		if (ac_data.length === 1) {
			// cannot interpolate with 1 data point, just return that datapoint
			interpolated_data.push(ac_data[0]);
		} else {
			for (let t = 1; t < ac_data.length; t++) {
				const deltaTime: number = +ac_data[t].time - +ac_data[t - 1].time;
				// console.log({ deltaTime });
				if (deltaTime === 0) {
					if (interpolated_data.length === 0) {
						// insert most recent datapoint
						interpolated_data.push(ac_data[t]);
					} else {
						// replace the last datapoint with the most recent
						interpolated_data[interpolated_data.length - 1] = ac_data[t];
					}
				} else if (deltaTime > 1) {
					const animatedSeries: DaaAircraft[] = animateAircraft([ ac_data[t - 1], ac_data[t] ], deltaTime, { dbg_lines: false });
					interpolated_data.push(...animatedSeries.slice(0, animatedSeries.length - 1));
				} else {
					interpolated_data.push(ac_data[t - 1]);
				}
				// add last data point
				if (t === ac_data.length - 1) {
					interpolated_data.push(ac_data[t]);
				}
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
 * Utility function, returns the output file name where the results will be written
 */
export function getOutputFileName (args: {
	fname: string, fname_trailer: string, ac_series: AcSeries, ownship: string, soloFlight: boolean
}, chunk: number): string {
	const trailer: string = `${args.fname.substring(0, args.fname.length - 4)}-${ownship}`;
	const segment: string = `${MAX_DAA_LINES > 0 ? chunk < 10 ? `-00${chunk}` : chunk < 100 ? `-0${chunk}` : `-${chunk}` : ""}`;
	const solo: string = args?.soloFlight ? "-solo" : "";
	return `${trailer}${segment}${solo}${args.fname_trailer}.daa`;
}

/**
 * Utility function, write ac_series to file
 */
export function write_ac_series_to_file (args: {
	fname: string, fname_trailer: string, ac_series: AcSeries, ownship: string, soloFlight: boolean
}) {
	const daa_data: DaaAircraft[] = acSeries2DaaData(args.ac_series, ownship);
	console.log("[csv2daa] Converting to .daa format...");
	const daa_units: string = UNITS;
	const daa_labels: string = LABELS;
	let chunk: number = 0;
	let daaFile: string = getOutputFileName(args, chunk);
	let daaFileContent: string = daa_labels + "\n" + daa_units;
	let lineCount: number = 0;
	const regex: RegExp = new RegExp(/\s+/g);
	const labels: string[] = daa_labels.replace(regex, ",").split(",").filter((label: string) => {
		return label?.trim()?.length > 0;
	});
	for (let i = 0; i < daa_data?.length; i++) {
		daaFileContent += "\n" + printAcSeriesLine(daa_data[i], labels);
		lineCount++;
		// each daa file should start with the ownship data
		if (MAX_DAA_LINES > 0 && lineCount > MAX_DAA_LINES 
				&& i + 1 < daa_data.length 
				&& daa_data[i + 1].name === ownship) {
			fs.writeFileSync(daaFile, daaFileContent);
			console.log(`[csv2daa] DAA file written: ${daaFile}`);
			// increment chunk number
			chunk++;
			// update daa file name
			daaFile = getOutputFileName(args, chunk);
			// reset daa file content
			daaFileContent = daa_labels + "\n" + daa_units;
			// reset counter
			lineCount = 0;
		}
	}
	fs.writeFileSync(daaFile, daaFileContent);
	console.log(`[csv2daa] DAA file written: ${daaFile}`);
}
/**
 * Utility function, converts a .csv file into .daa
 * The cvs file is assumed to have the following columns:
 * TAIL_NUMBER, TIMESTAMP, LATITUDE_DEG, LONGITUDE_DEG, ALTITUDE_BARO_FT, GROUND_SPEED_KTS
 */
export function csv2daa (fname: string, ownship: string, opt?: { soloFlight: boolean, airborneOwnship?: boolean }): boolean {
    if (fname && ownship) {
        console.log(`[csv2daa] Processing ${fname} ...`);
        const data: string = fs.readFileSync(fname).toLocaleString() || "";
        if (data) {
            // get ac series
            const ac_series: AcSeries = dataset2acseries(data, { ...opt, removeGroundTraffic: true, ownship, fname });
			// write_ac_series_to_file({ ...opt, fname, fname_trailer: "-orig", ac_series, ownship });
			// debug output
            // console.dir({ ac_series }, { depth: null });
			// const acs: string[] = Object.keys(ac_series);
			// for (let i = 0; i < acs?.length; i++) {
			// 	console.dir(ac_series[acs[i]][0], { depth: null });
			// }
            // process each aircraft independently and limit the time range based on the ownship
            const trkvs_ac_series: AcSeries = computeTrkVs(ac_series, ownship);
			write_ac_series_to_file({ ...opt, fname, fname_trailer: "-orig", ac_series: trkvs_ac_series, ownship });
			// console.dir({ trkvs_ac_series }, { depth: null });
            const integer_ac_series: AcSeries = adjustTime(trkvs_ac_series);
			write_ac_series_to_file({ ...opt, fname, fname_trailer: "-integer_time", ac_series: integer_ac_series, ownship });
			// // console.dir({ integer_ac_series }, { depth: null });
            const interpolated_ac_series: AcSeries = interpolateAcSeries(integer_ac_series);
			write_ac_series_to_file({ ...opt, fname, fname_trailer: "-interpolated", ac_series: interpolated_ac_series, ownship });
			// console.dir({ interpolated_ac_series }, { depth: null });
            // const daa_data: DaaAircraft[] = acSeries2DaaData(interpolated_ac_series, ownship);
            // convert to .daa
            // console.log("[csv2daa] Converting to .daa format...");
            // const daa_units: string = UNITS;
            // const daa_labels: string = LABELS;
            // let chunk: number = 0;
            // let daaFile: string = `${fname}-${ownship}-${chunk < 10 ? `00${chunk}` : chunk < 100 ? `0${chunk}` : chunk}${opt.soloFlight ? "-solo" : ""}.daa`;
            // let daaFileContent: string = daa_labels + "\n" + daa_units;
            // let lineCount: number = 0;
            // const regex: RegExp = new RegExp(/\s+/g);
            // const labels: string[] = daa_labels.replace(regex, ",").split(",");
            // for (let i = 0; i < daa_data.length; i++) {
            //     daaFileContent += "\n" + printAcSeriesLine(daa_data[i], labels);
            //     lineCount++;
            //     // each daa file should start with the ownship data
            //     if (MAX_DAA_LINES > 0 && lineCount > MAX_DAA_LINES 
            //             && i + 1 < daa_data.length 
            //             && daa_data[i + 1].name === ownship) {
            //         fs.writeFileSync(daaFile, daaFileContent);
            //         console.log(`[csv2daa] DAA file written: ${daaFile}`);
            //         // increment chunk number
            //         chunk++;
            //         // update daa file name
            //         daaFile = `${fname}-${ownship}-${chunk < 10 ? `00${chunk}` : chunk < 100 ? `0${chunk}` : chunk}${opt.soloFlight ? "-solo" : ""}.daa`;
            //         // reset daa file content
            //         daaFileContent = daa_labels + "\n" + daa_units;
            //         // reset counter
            //         lineCount = 0;
            //     }
            // }
            // fs.writeFileSync(daaFile, daaFileContent);
            // console.log(`[csv2daa] DAA file written: ${daaFile}`);
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
node convert-csv2daa <file.csv>`;
}

// get args from command line
const args: string[] = process.argv?.slice(2);
console.log('args: ', args);
const ownship: string = args?.length > 1 && args[1] ? args[1] : "ownship";
const soloFlight: boolean = args?.length > 2 && args[2] ? args[2] === "true" : false;
const airborneOwnship: boolean = args?.length > 3 && args[3] ? args[3] === "true" : true;
// TODO: add command line options for the following functions:
// - list ac names
// - select ownship name (this will put constraints on the timestamp range)
if (args?.length && args[0]) {
	console.log({ ownship, soloFlight, airborneOwnship });
    csv2daa(args[0], ownship, { soloFlight, airborneOwnship });
} else {
    console.log(help());
}