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
 
import gov.nasa.xpc.XPlaneConnect;
import java.io.IOException;
import java.net.SocketException;
import java.util.HashMap;
import java.lang.Math.*;
import gov.nasa.larcfm.Util.Vect2;


/**
 * @author Paolo Masci
 * @date 2022-02-04
 * @description XPlaneConnection: Creates a connection between danti and xplane, to allow danti to retrieve ownship and traffic data from xplane
 * This is a variant of XPlaneConnection, and two workarounds are used to overcome a problem with setting speed and heading when the physics engine of xplane is disabled
 * See also http://www.xsquawkbox.net/xpsdk/docs/DataRefs.html and http://www.xsquawkbox.net/xpsdk/mediawiki/MovingThePlane
 * Data is printed as a string in JSON format and has the following structure
 * {
 *      ownship: { 
 *          name: string,
 *          lat: { val: string, units: string },
 *          lon: { val: string, units: string },
 *          alt: { val: string, units: string },
 *          heading: { val: string, units: string },
 *          vspeed: { val: string, units: string },
 *          airspeed: { val: string, units: string }
 *      },
 *      traffic: [
 *          {
 *              name: string,
 *              lat: { val: string, units: string },
 *              lon: { val: string, units: string },
 *              alt: { val: string, units: string },
 *              heading: { val: string, units: string },
 *              vspeed: { val: string, units: string },
 *              airspeedspeed: { val: string, units: string } 
 *          } 
 *          ... (one entry for each traffic aircraft, xplane 11 supports 20 aircraft max)
 *      ]
 * }
 */
public class XPlaneConnectionReplay extends XPlaneConnection {

    /**
     * Returns the heading of an aircraft
     * xplane 11 supports up-to 20 aircraft (ownship + 19 traffic)
     * ownship is ac 0
     */
    // String getHeading (int ac) {
    //     if (ac >= 0 && ac <= MAX_XPLANE_AIRCRAFT_ID) {
    //         String dref = ac > 0 ?
    //             "sim/multiplayer/position/plane" + ac + "_psi"
    //                 : "sim/flightmodel/position/psi";
    //         try {
    //             // get values from xplane
    //             float[] deg = xpc.getDREF(dref);
    //             // FIXME: the heading of the ownship seems to be rotated by 180deg? 
    //             //        not sure what is going on, it might be xplane changing the heading because we are not adjusting x y z
    //             double heading = ac == 0 ? deg[0] - 180 : deg[0];
    //             return String.valueOf(heading);
    //         } catch (IOException ex) {
    //             System.out.println("{ \"error\": \"" + ex.getMessage() + "\" }");
    //         }
    //     }
    //     return "0";
    // }
    /**
     * Returns the airspeed of an aircraft, instead of groundspeed in knot
     * this is necessary when re-playing a scenario, because we cannot write groundspeed (but we can write airspeed)
     * xplane 11 supports up-to 20 aircraft (ownship + 19 traffic)
     * ownship is ac 0
     */
    String getAirspeed (int ac) {
        if (ac == 0) {
            log("indicated_airspeed");
            String dref = "sim/flightmodel/position/indicated_airspeed";
            try {
                // get values from xplane
                float[] kn = xpc.getDREF(dref);
                return String.valueOf(kn[0]);
            } catch (IOException ex) {
                System.out.println("{ \"error\": \"" + ex.getMessage() + "\" }");
            }
        } else if (ac > 0 && ac < MAX_XPLANE_AIRCRAFT_ID) {
            // The linear velocity of the aircraft is controlled by three values (see http://www.xsquawkbox.net/xpsdk/mediawiki/MovingThePlane)
            // sim/multiplayer/position/plane1_v_x
            // sim/multiplayer/position/plane1_v_y
            // sim/multiplayer/position/plane1_v_z
            // This determines both the aircraft's direction (in 3-d space) and its speed. 
            // Units are meters per second. 
            // This vector is in the world coordinate system
            // A velocity along the X axis moves the aircraft east no matter which way the aircraft is heading.
            String[] drefs = {
                "sim/multiplayer/position/plane" + ac + "_v_x",
                "sim/multiplayer/position/plane" + ac + "_v_y",
                "sim/multiplayer/position/plane" + ac + "_v_z",
            };
            try {
                // get values from xplane
                float[][] msec = xpc.getDREFs(drefs);
                // get the magnitude (norm) of the vector, using gov.nasa.larcfm.Util.Vect2
                Vect2 av = new Vect2(msec[0][0], msec[1][0]);
                double airspeed = av.norm();
                return String.valueOf(XPlaneConnection.msec2knots(airspeed));
            } catch (IOException ex) {
                System.out.println("{ \"error\": \"" + ex.getMessage() + "\" }");
            }
        }
        return "0";
    }

    /**
     * Main method
     */
    public static void main (String[] args) {
        XPlaneConnection xplane = new XPlaneConnectionReplay();
        boolean success = xplane.activate();
        if (success) {
            xplane.exec(args);
        }
    }
}
