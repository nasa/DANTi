/**
 * @author: Paolo Masci
 * @date: 2022.02.05
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
import { DantiConnection } from "./danti-connection";

// get args from command line
const args: string[] = process.argv?.slice(2);
console.log('args: ', args);
const address: string = args?.length ? args[0] : "0.0.0.0"; // default connection is on localhost

const replay: boolean = args?.includes("-replay");
console.log("[connect-xplane2danti] REPLAY MODE: ON");

// frequency of periodic send
const interval: number = 1000; //ms

// connect to danti
const danti: DantiConnection = new DantiConnection({ danti_address: address });
danti.activate().then((success: boolean) => {
    if (success) {
        // connect to xplane
        const xplane: XPlaneConnection = new XPlaneConnection();
        // set danti labels and units
        const labels: string = xplane.printLabels();
        danti?.sendLabels(labels);
        const units: string = xplane.printUnits();
        danti?.sendUnits(units);
        // send data
        const run = async () => {
            const data: XPlaneData = await xplane.getXPlaneData({ replay });
            console.log(`[connect-xplane2danti] xplane data received`);
            console.dir(data, { depth: null });
            if (data && !data.error) {
                if (data.ownship) {
                    if (!data.ownship.error) {
                        // console.log("[connect-xplane2danti] Sending data to DANTi Display", data);
                        const ownshipData: string = xplane.printDantiAircraft(data, 0);
                        console.log("[connect-xplane2danti] ownship data", ownshipData);
                        // send ownship data
                        await danti?.sendOwnshipData(ownshipData);
                    } else {
                        console.log("[connect-xplane2danti] **skipping** ownship data", { error: data.ownship?.error });
                    }
                }
                // send traffic info
                const acData: string[] = xplane.printDantiTraffic(data);
                console.log("[connect-xplane2danti] Traffic", acData);
                for (let i = 0; i < acData?.length; i++) {
                    if (data.traffic) {
                        if (!data.traffic[i].error) {
                            console.log("[connect-xplane2danti] traffic data", acData[i]);
                            await danti?.sendTrafficData(acData[i]);
                        } else {
                            console.log("[connect-xplane2danti] **skipping** traffic data", { ac: i, error: data.traffic[i]?.error });
                        }
                    }
                }
                // notify epoch end to indicate all available data have been sent
                await danti?.notifyEpochEnd();                
            }
        };
        // run now
        run();
        // and run iteratively every interval seconds, until the user interrupts with Ctrl+C
        setInterval (() => {
            run();
        }, interval);
    } else {
        console.log(`[connect-xplane2danti] Warning: Unable to connect to DANTi Display.`);
    }
});