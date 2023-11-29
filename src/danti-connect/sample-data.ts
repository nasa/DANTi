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

// example traffic data
// import { cities } from '../daa-displays/daa-map-components/daa-airspace';
// import { DAA_AircraftDescriptor } from '../daa-displays/daa-interactive-map';
import { LatLon, LatLonAlt, LLAData, LLAPosition, Vector3D } from "../daa-displays/utils/daa-types";

// TODO: define daa-displays-interface
export interface DAA_AircraftDescriptor {
    s: LatLonAlt<number | string>;
    v: Vector3D<number | string>;
    symbol: string;
    callSign: string;
}
export const cities = {
    hampton: {
        lat: 37.0298687,
        lon: -76.3452218
    },
    nyc: {
        lat: 40.7128,
        lon: -74.0060
    },
    norfolk: {
        lat: 36.8508,
        lon: -76.2859
    },
    newportnews: {
        lat: 37.0871,
        lon: -76.4730
    },
    fishermanisland: {
        lat: 37.0929,
        lon: -75.9635
    },
    virginiabeach: {
        lat: 36.8529,
        lon: -75.9780
    },
    poquoson: {
        lat: 37.1224,
        lon: -76.3458
    },
    chesapeake: {
        lat: 36.7682,
        lon: -76.2875
    },
    portsmouth: {
        lat: 36.8354,
        lon: -76.2983
    },
    suffolk: {
        lat: 36.7282,
        lon: -76.5836
    }
};


export const ownship: LLAPosition = {
    id: "AC0",
    s: {
        lat: "28.496733",
        lon: "-80.530344",
        alt: "3994.231476"
    },
    v: {
        x: "292.619934",
        y: "169.822964",
        z: "40.558194"
    }
};
export const others: DAA_AircraftDescriptor[] = [
{
    callSign: "AC1",
    s: {
        lat: `${cities.hampton.lat}`,
        lon: `${cities.hampton.lon}`,
        alt: "4000.018859"
    },
    v: {
        x: "107.350647",
        y: "200.000092",
        z: "0.004356"
    },
    symbol: "daa-traffic-monitor"
},
{
    callSign: "AC2",
    s: {
        lat: "28.520167",
        lon: "-80.61631",
        alt: "3500.007042"
    },
    v: {
        x: "299.373444",
        y: "110.000044",
        z: "0.001983"
    },
    symbol: "daa-traffic-avoid"
},
{
    callSign: "AC3",
    s: {
        lat: "28.5166",
        lon: "-80.70284",
        alt: "6000.008612"
    },
    v: {
        x: "76.524117",
        y: "164.000187",
        z: "0.00126"
    },
    symbol: "daa-alert"
}
];

export const traffic: LLAPosition[] = others.map((elem: DAA_AircraftDescriptor) => {
    return {
        s: {
            lat: `${elem.s.lat}`,
            lon: `${elem.s.lon}`,
            alt: `${elem.s.alt}`
        },
        v: {
            x: `${elem.v.x}`,
            y: `${elem.v.y}`,
            z: `${elem.v.z}`
        },
        id: elem.callSign
    };
});

export const geofence_perimeter: LatLon<number | string>[] = [
    { lat: cities.hampton.lat, lon: cities.hampton.lon },
    { lat: cities.newportnews.lat, lon: cities.newportnews.lon },
    { lat: cities.poquoson.lat, lon: cities.poquoson.lon }
];

export const geofence_floor: { top: string | number, bottom: string | number } = { top: 120, bottom: "SFC" };

export const flightData: LLAData = {
    ownship,
    traffic
};
