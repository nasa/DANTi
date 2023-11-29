/**
 * @author: Paolo Masci
 * @date: 2022.02.06
 * 
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

import { XPlaneConnection, XPlaneData } from "./xplane/xplane-connection";

// get args from command line
const args: string[] = process.argv?.slice(2);
console.log('args: ', args);

// connect to xplane
const xplane: XPlaneConnection = new XPlaneConnection();
const replay: boolean = true;

// get data from xplane
const test = async () => {
    console.log(`[test-xplane-connection] testing xplane connection...`);

    // pause simulation, otherwise the xplane engine interferes with settings position and velocity
    await xplane.pauseSimulation();
    console.log(`[test-xplane-connection] xplane.pauseSimulation()`);

    // disable physics engine
    await xplane.disablePhysicsEngine();
    console.log(`[test-xplane-connection] xplane.disablePhysicsEngine()`);

    // get ownship data
    let data: XPlaneData = await xplane.getXPlaneData({ replay });
    console.log(`[test-xplane-connection] xplane.getXPlaneData({ replay })`);
    console.dir(data, { depth: null });

    // set ownship position
    // lat lon of Seattle -- this is the only area we can fly with the demo version of x-plane
    const lat: number = 47.461; // deg
    const lon: number = -122.30775451660156; // deg
    let alt: number = 550; // ft
    let trk: number = 0; // deg
    await xplane.setPosition({ name: "ownship", lat, lon, alt, heading: trk });
    await xplane.setSpeed(0, 0);
    data = await xplane.getXPlaneData({ replay });
    const positionOk: boolean = +data?.ownship?.lat === lat
        && +data?.ownship?.lon === lon
        && +data?.ownship.alt === alt;
    console.log(`[test-xplane-connection] xplane.setPosition(${lat}, ${lon}, ${alt})`, positionOk);
    console.dir(data, { depth: null });

    // set traffic position and heading
    const trf = [
        {
            name: `ac1`,
            lat: lat - 0.0005, 
            lon, 
            alt: alt - 65, 
            heading: trk
        },
        { 
            name: `ac2`,
            lat: lat - 0.0015, 
            lon, 
            alt: alt - 50, 
            heading: trk 
        },
        { 
            name: `ac3`,
            lat: lat - 0.0020, 
            lon, 
            alt: alt - 40, 
            heading: trk 
        },
    ];
    await xplane.setTrafficPosition(trf);
    data = await xplane.getXPlaneData({ replay });
    // const trafficOk: boolean = +xplane.getVal(data, "sim/flightmodel/position/latitude") === lat
    //     && +xplane.getVal(data, "sim/flightmodel/position/longitude") === lon
    //     && +xplane.getVal(data, "sim/flightmodel/position/elevation") === alt;
    console.log(`[test-xplane-connection] xplane.setTraffic(${JSON.stringify(trf)})`);
    console.dir(data, { depth: null });

    // change ownship altitude and heading
    for (let i = 0; i < 6; i++) {
        await xplane.setPosition({ name: "ownship", lat, lon, alt, heading: trk });
        data = await xplane.getXPlaneData({ replay });
        const altOk: boolean = +parseInt(data?.ownship?.alt?.val) === alt;
        const trkOk: boolean = +parseInt(data?.ownship?.heading?.val) === trk;
        console.log(`[test-xplane-connection] xplane.setPosition(${lat}, ${lon}, ${alt}, ${trk})`, altOk, trkOk);
        console.dir(data, { depth: null });
        trk += 60;
    }
    for (let i = 0; i < 6; i++) {
        alt += 1;
        await xplane.setPosition({ name: "ownship", lat, lon, alt, heading: trk });
        data = await xplane.getXPlaneData({ replay });
        const altOk: boolean = +parseInt(data?.ownship?.alt?.val) === alt;
        const trkOk: boolean = +parseInt(data?.ownship?.heading?.val) === trk;
        console.log(`[test-xplane-connection] xplane.setPosition(${lat}, ${lon}, ${alt}, ${trk})`, altOk, trkOk);
        console.dir(data, { depth: null });
    }
    for (let i = 0; i < 6; i++) {
        alt -= 1;
        await xplane.setPosition({ name: "ownship", lat, lon, alt, heading: trk });
        data = await xplane.getXPlaneData({ replay });
        const altOk: boolean = +parseInt(data?.ownship?.alt?.val) === alt;
        const trkOk: boolean = +parseInt(data?.ownship?.heading?.val) === trk;
        console.log(`[test-xplane-connection] xplane.setPosition(${lat}, ${lon}, ${alt}, ${trk})`, altOk, trkOk);
        console.dir(data, { depth: null });
    }

    // change traffic altitude, heading, speed
    trk = 0;
    const tfc_airspeed: number = 80; // knots
    const tfc_vspeed: number = 55; // fpm
    for (let i = 0; i < 6; i++) {
        const args0 = { name: trf[0].name, lat: trf[0].lat, lon: trf[0].lon, alt: trf[0].alt, heading: trk, airspeed: tfc_airspeed, vspeed: tfc_vspeed };
        const args1 = { name: trf[1].name, lat: trf[1].lat, lon: trf[1].lon, alt: trf[1].alt, heading: trk, airspeed: tfc_airspeed, vspeed: tfc_vspeed };
        await xplane.setTrafficPosition([ args0, args1 ]);
        await xplane.setTrafficSpeed([ args0, args1 ]);
        data = await xplane.getXPlaneData({ replay });
        console.log(`[test-xplane-connection] xplane.setTraffic(${JSON.stringify(args)})`, data?.traffic);
        trk += 60;
    }
    alt = trf[0].alt;
    for (let i = 0; i < 6; i++) {
        alt += 1;
        const args0 = { name: trf[0].name, lat: trf[0].lat, lon: trf[0].lon, alt, heading: trk, airspeed: tfc_airspeed, vspeed: tfc_vspeed };
        const args1 = { name: trf[1].name, lat: trf[1].lat, lon: trf[1].lon, alt, heading: trk, airspeed: tfc_airspeed, vspeed: tfc_vspeed };
        await xplane.setTrafficPosition([ args0, args1 ]);
        await xplane.setTrafficSpeed([ args0, args1 ]);
        console.log(`[test-xplane-connection] xplane.setTraffic(${JSON.stringify(args)})`, data?.traffic);
        data = await xplane.getXPlaneData({ replay });
    }
    for (let i = 0; i < 6; i++) {
        alt -= 1;
        const args0 = { name: trf[0].name, lat: trf[0].lat, lon: trf[0].lon, alt, heading: trk, airspeed: tfc_airspeed, vspeed: tfc_vspeed };
        const args1 = { name: trf[1].name, lat: trf[1].lat, lon: trf[1].lon, alt, heading: trk, airspeed: tfc_airspeed, vspeed: tfc_vspeed };
        await xplane.setTrafficPosition([ args0, args1 ]);
        await xplane.setTrafficSpeed([ args0, args1 ]);
        console.log(`[test-xplane-connection] xplane.setTraffic(${JSON.stringify(args)})`, data?.traffic);
        data = await xplane.getXPlaneData({ replay });
    }
    const trf_airspeedOk: boolean = data?.traffic?.length ? +parseInt(data?.traffic[0]?.airspeed?.val) === tfc_airspeed : false;
    const trf_vspeedOk: boolean = data?.traffic?.length ? +parseInt(data?.traffic[0]?.vspeed?.val) === tfc_vspeed : false;
    console.log(`[test-xplane-connection] xplane.setTraffic(...)`, trf_airspeedOk, trf_vspeedOk);
    
    // change ownship airspeed and vspeed
    const airspeed: number = 80; // knot
    const vspeed: number = 55; // fpm
    await xplane.setSpeed(airspeed, vspeed);
    data = await xplane.getXPlaneData({ replay });
    const airspeedOk: boolean = +parseInt(data?.ownship?.airspeed?.val) === airspeed;
    const vspeedOk: boolean = +parseInt(data?.ownship?.vspeed?.val) === vspeed;
    console.log(`[test-xplane-connection] xplane.setSpeed(${airspeed}, ${vspeed})`, airspeedOk, vspeedOk);
    console.dir(data, { depth: null });

    // pause simulation
    // await xplane.pauseSimulation();
    // console.log(`[test-xplane-connection] xplane.pauseSimulation()`);

    // change planet
    // await xplane.setPlanet("mars"); // this does not seem to do anything in the free demo version
}
// run the test
test();