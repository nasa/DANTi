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

// filters applied by danti-server to ownship/traffic aircraft
import { alt_header, findColFromName, getCol, lat_header, lon_header, name_header } from '../daa-displays/utils/daa-reader';
import { OwnshipDataRequest, TrafficDataRequest } from './danti-interface';
import { TRAFFIC_DETECTION_RANGE_H, TRAFFIC_DETECTION_RANGE_V } from '../config';
import { meters2feet } from '../daa-displays/utils/daa-math';

// daa bands and alerts are not computed for traffic aircraft whose lat lon is more than MIX_TRAFFIC_DISTANCE from the ownship
export function nearby (ownship: OwnshipDataRequest, traffic: TrafficDataRequest, labels: string, units: string): boolean {
    let nearby: boolean = true;
    // check traffic against filters
    if (ownship?.data && traffic?.data && (TRAFFIC_DETECTION_RANGE_H > 0 || TRAFFIC_DETECTION_RANGE_V > 0)) {
        // apply traffic filter
        console.log(`[danti-filters] Applying traffic filters`, { TRAFFIC_DETECTION_RANGE_H, TRAFFIC_DETECTION_RANGE_V, labels, ownship, traffic });
        const nameCol: number = findColFromName(name_header, labels);
        const latCol: number = findColFromName(lat_header, labels); // deg
        const lonCol: number = findColFromName(lon_header, labels); // deg
        const altCol: number = findColFromName(alt_header, labels); // ft

        // units
        // const latUnits: string = getCol(latCol, units); // deg
        // const lonUnits: string = getCol(lonCol, units); // deg
        const altUnits: string = getCol(altCol, units); // ft

        // ownship data
        // const ownshipTailNumber: string = getCol(nameCol, ownship.data);
        const ownshipLatVal: number = +getCol(latCol, ownship.data);
        const ownshipLonVal: number = +getCol(lonCol, ownship.data);
        const ownshipAltVal: number = +getCol(altCol, ownship.data);

        // traffic data
        const trafficTailNumber: string = getCol(nameCol, traffic.data);
        const trafficLatVal: number = +getCol(latCol, traffic.data);
        const trafficLonVal: number = +getCol(lonCol, traffic.data);
        const trafficAltVal: number = +getCol(altCol, traffic.data);

        // check traffic distance from the ownship
        // One minute of latitude/longitude correspond to one nautical mile (1 naut. mile or 1 nm, equivalent to 1.582 km)
        // so one degree (1°) of latitude/longitude corresponds to 60 nautical miles or approximately 111 km.
        const delta_lat: number = Math.abs(ownshipLatVal - trafficLatVal) * 60; // nmi
        const delta_lon: number = Math.abs(ownshipLonVal - trafficLonVal) * 60; // nmi
        const delta_alt: number = Math.abs(ownshipAltVal - trafficAltVal);
        const hor_distance_sq: number = delta_lat * delta_lat + delta_lon * delta_lon;
        const ver_distance: number = altUnits === "[m]" ? meters2feet(delta_alt) : delta_alt;
        nearby = (TRAFFIC_DETECTION_RANGE_H <= 0 || hor_distance_sq <= (TRAFFIC_DETECTION_RANGE_H * TRAFFIC_DETECTION_RANGE_H))
            && (TRAFFIC_DETECTION_RANGE_V <= 0 || ver_distance <= TRAFFIC_DETECTION_RANGE_V);
        console.log(`[danti-server] Traffic aircraft ${trafficTailNumber} is ${nearby ? "nearby" : "far away" }`, { delta_lat, delta_lon, hor_distance_sq, ver_distance, TRAFFIC_DETECTION_RANGE_H, TRAFFIC_DETECTION_RANGE_V });
    }
    return nearby;
}