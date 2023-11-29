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
public class XPlaneConnection {
    /**
     * Logging of debug messages
     */
    boolean logging_enabled = false;

    /**
     * Connection to xplane
     */
    XPlaneConnect xpc;

    /**
     * Flag indicating whether the physics model is enabled
     * When the physics model is disabled, the aircraft position is described by "psi" (heading), "theta" (pitch), and "phi" (roll).
     * When the physics model is enabled, the aircraft position is described by a quaternion, see http://www.xsquawkbox.net/xpsdk/mediawiki/MovingThePlane
     * X-Plane also features up to nineteen other multiplayer aircraft. Generally they are controlled with the sim/multiplayer/position datarefs
     */
    protected boolean physics_enabled = false;

    /**
     * Max xplane aircraft ID -- xplane 11 supports up-to 20 aircraft
     */
    protected int MAX_XPLANE_AIRCRAFT_ID = 20;

    /**
     * Ownship data, see also http://www.xsquawkbox.net/xpsdk/docs/DataRefs.html
     */
    String[] ownship_data_drefs = {
        "sim/flightmodel/position/latitude", // latitude, in deg
        "sim/flightmodel/position/longitude", // longitude, in deg
        "sim/flightmodel/position/elevation", // altitude, xplane provides in meters, here is converted to ft

        "sim/flightmodel/position/psi", // The true heading of the aircraft, in deg

        "sim/flightmodel/position/groundspeed", // ground speed, xplane provides in m/s, here is converted to knots
        "sim/flightmodel/position/indicated_airspeed", // indicated air speed, xplane provides in m/s, here is converted to knots
        "sim/flightmodel/position/indicated_airspeed2", // indicated air speed, xplane provides in m/s, here is converted to knots
        "sim/flightmodel/position/true_airspeed", // true air speed, xplane provides in m/s, here is converted to knots
        
        "sim/flightmodel/position/vh_ind", // vertical velocity, xplane provides in m/s
        "sim/flightmodel/position/vh_ind_fpm", // vertical velocity, in ft/s
        "sim/flightmodel/position/vh_ind_fpm2" // vertical velocity, in ft/s
    };
    // native units used by xplane
    String[] ownship_data_units = {
        "deg", // latitude, in deg
        "deg", // longitude, in deg
        "m", // altitude, in meters

        "deg", // heading (track), in deg

        "m/s", // ground speed, in m/s
        "m/s", // indicated air speed, in m/s
        "m/s", // indicated air speed, in m/s
        "m/s", // true air speed, in m/s
        "m/s", // vertical velocity, in m/s
        "fpm", // vertical velocity, in fpm (feet per minute)
        "fpm" // vertical velocity, in fpm
    };

    /**
     * max traffic aircraft we want to handle (xplane 11 supports up-to 19 aircraft)
     * here we are artificially reducing to 4 for performance reasons
     */
    int MAX_TRAFFIC = 4;
    /**
     * minimum airspeed (ms/sec), this is used to try to distinguish situations where
     * the xplane simulation is paused
     */
    int MIN_AIRSPEED = 4; // [m/sec]

    /**
     * tail numbers
     */
    protected HashMap<String, String> tail_number = new HashMap<String, String>();

    /**
     * Constructor
     */
    XPlaneConnection () { }

    /**
     * Returns the name of an aircraft
     */
    String getName (int ac) {
        String name = tail_number.get(String.valueOf(ac));
        return (name != null) ? name : "AC" + ac;
    }

    /**
     * Clears all tail numbers
     */
    void clearAircraftNames () {
        tail_number.clear();
    }

    /**
     * Utility function, converts feet to meters
     */
    static double feet2meters(double ft) {
        return ft / 3.28084;
    };

    /**
     * Utility function, converts meters to feet
     */
    static double meters2feet(double m) {
        return m * 3.28084;
    };
    /**
     * Utility function, converts m/s to knots
     */
    static double msec2knots(double msec) {
        return msec * 1.94384;
    };
    /**
     * Utility function, converts m/s to fpm
     */
    static double msec2fpm(double msec) {
        return XPlaneConnection.meters2feet(msec / 60);
    };
    /**
     * Utility function, converts knots to m/s
     */
    static double knots2msec(double knots) {
        return knots / 1.94384;
    };
    /**
     * Utility function, converts fpm to m/s
     */
    static double fpm2msec(double fpm) {
        return feet2meters(fpm) * 60;
    };
    /**
     * Utility function, converts degs to rads
     */
    static double deg2rad(double deg) {
        return deg * Math.PI / 180;
    };
    /**
     * Utility function, converts rads to degs
     */
    static double rad2deg(double rad) {
        return rad * 180 / Math.PI;
    };
    
    

    /**
     * utility function, prints a debug message in JSON format
     */
    void log (String msg) {
        if (logging_enabled) {
            System.err.println("{ \"msg\": \"" + msg + "\" }");
        }
    }

    /**
     * Activates the connection to xplane
     */
    boolean activate () {
        try {
            xpc = new XPlaneConnect();
        } catch (SocketException ex) {
            System.out.println("{ \"error\": \"" + ex.getMessage() + "\" }");
            return false;
        }
        return true;
    }

    /**
     * Internal function, joins two array of strings
     */
    String[] join (String[] a1, String[] a2) {
        String[] joined = new String[a1.length + a2.length];
        for (int i = 0; i < a1.length; i++) {
            joined[i] = a1[i];
        }
        for (int i = 0; i < a2.length; i++) {
            joined[a1.length + i] = a2[i];
        }
        return joined;
    }

    /**
     * Internal function, prints the given info in JSON format
     */
    protected String toJSON (String label, double value, String unit) {
        return "\"" + label + "\": { \"val\": \"" + value + "\", \"units\": \"" + unit + "\" }";
    }

    /**
     * Returns ownship data in JSON format, see also getAircraftData
     */
    String getOwnshipData () {
        return getAircraftData(0);
    }
    /**
     * Returns traffic data in JSON format, see also getAircraftData
     * Only flying aircraft are returned (i.e., aircraft with airspeed >= MIN_AIRSPEED)
     */
    String getTrafficData () {
        String ans = "";
        int nFlyingAircraft = 0;
        for (int i = 0; i < MAX_TRAFFIC; i++) {
            String data = getFlyingAircraftData(i + 1);
            if (data != null) {
                nFlyingAircraft++;
                if (nFlyingAircraft > 1) { ans += ",\n"; }
                ans += getAircraftData(i + 1);
            }
        }
        ans = "[\n" + ans + "\n]";
        return ans;
    }

    /**
     * Returns ownship and traffic data in the following JSON format:
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
     *              airspeed: { val: string, units: string } 
     *          } 
     *          ... (one entry for each traffic aircraft, xplane 11 supports 20 aircraft max)
     *      ]
     * }
     */
    String getFlightData () {
        // String[] drefs = ownship_data_drefs;
        // try {
            // get values from xplane
            // float[][] values = xpc.getDREFs(drefs);
            // print values in JSON format
            // String[] units = ownship_data_units;
            String ans = "\"ownship\": " + getOwnshipData()
                + ",\n \"traffic\": " + getTrafficData();
            ans = "{\n" + ans + "\n}";
            return ans;
        // } catch (IOException ex) {
        //     if (ex.getMessage().equals("No response received.")) {
        //         return "{ \"error\": \"Unable to connect to XPlane.\" }";
        //     }
        //     return "{ \"error\": \"" + ex.getMessage() + "\" }";
        // }
    }

    /**
     * Sets ownship position, airspeed
     * lat [deg]
     * lon [deg]
     * alt [ft]
     * airspeed [knot]
     */
    boolean setOwnshipPosition (String name, String lat, String lon, String alt) {
        return setAircraftPosition(0, name, lat, lon, alt);
    }
    boolean setOwnshipPosition (String name, String lat, String lon, String alt, String heading) {
        return setAircraftPosition(0, name, lat, lon, alt, heading);
    }
    boolean setOwnshipPosition (String name, String lat, String lon, String alt, String heading, String bank) {
        return setAircraftPosition(0, name, lat, lon, alt, heading, bank);
    }
    boolean setOwnshipAirspeed (String airspeed) {
        return setAircraftAirspeed(0, airspeed);
    }
    boolean setOwnshipVerticalSpeed (String airspeed) {
        return setAircraftAirspeed(0, airspeed);
    }
    boolean setOwnshipSpeed (String airspeed, String vspeed) {
        return setAircraftSpeed(0, airspeed, vspeed);
    }


    /**
     * Sets aircraft position and heading
     * lat lon heading in deg, alt in ft
     * TODO: set velocity vector accordingly, so everything works when the physics model is enabled
     */
    boolean setAircraftPosition (int ac, String name, String lat, String lon, String alt, String heading) {
        return setAircraftPosition (ac, name, lat, lon, alt, heading, "0");
    }
    boolean setAircraftPosition (int ac, String name, String lat, String lon, String alt, String heading, String roll) {
        log("Moving " + name + " to lat=" + lat + "[deg] lon=" + lon + "[deg] alt=" + alt + "[ft] (heading=" + heading + "[deg], roll=" + roll + "[deg])");
        // args of sendPOSI:
        // Latitude (deg)
        // Longitude (deg)
        // Altitude (m above MSL)
        // Pitch (deg)
        // Roll (deg)
        // True Heading (deg)
        // Gear (0=up, 1=down)
        double alt_meters = XPlaneConnection.feet2meters(Double.parseDouble(alt));
        double pitch = 0;
        tail_number.put(String.valueOf(ac), name);
        double[] posi = new double[] {
            Double.parseDouble(lat),
            Double.parseDouble(lon),
            alt_meters, 
            pitch, 
            Double.parseDouble(roll), 
            Double.parseDouble(heading),
            0 // gear up
        };
        try {
            xpc.sendPOSI(posi, ac);
        } catch (IOException ex) {
            System.out.println("{ \"error\": \"" + ex.getMessage() + "\" }");
            return false;
        }
        return true;
    }
    /**
     * Sets aircraft position and forces heading to 0deg
     * TODO: keep current heading instead of forcing to 0deg
     * lat lon heading in deg, alt in ft
     */
    boolean setAircraftPosition (int ac, String name, String lat, String lon, String alt) {
        return setAircraftPosition(ac, name, lat, lon, alt, "0", "0");
    }
    /**
     * Returns the heading of an aircraft
     * xplane 11 supports up-to 20 aircraft (ownship + 19 traffic)
     * ownship is ac 0
     */
    String getHeading (int ac) {
        if (ac <= MAX_XPLANE_AIRCRAFT_ID) {
            String dref = ac > 0 ?
                "sim/multiplayer/position/plane" + ac + "_psi"
                    : "sim/flightmodel/position/psi";
            try {
                // get values from xplane
                float[] deg = xpc.getDREF(dref);
                double heading = deg[0]; //ac == 0 ? deg[0] - 180 : deg[0]; // the heading of the ownship seems to be rotated by 180deg? FIXME: not sure what is going on
                return String.valueOf(heading);
            } catch (IOException ex) {
                System.out.println("{ \"error\": \"" + ex.getMessage() + "\" }");
            }
        }
        return "0";
    }
    /**
     * Returns the groundspeed of an aircraft, in knot -- the airspeed seems to be incorrect, not sure what is going on
     * xplane 11 supports up-to 20 aircraft (ownship + 19 traffic)
     * ownship is ac 0
     */
    String getAirspeed (int ac) {
        if (ac == 0) {
            log("groundspeed"); // use this during live simulations
            String dref_gs = "sim/flightmodel/position/groundspeed";//"sim/flightmodel/position/indicated_airspeed";
            try {
                // get values from xplane
                float[] msec = xpc.getDREF(dref_gs);
                if (msec[0] < MIN_AIRSPEED) {
                    log("indicated_airspeed"); // use this when the physics engine is disabled (e.g., during feedback)
                    String dref_indicated_airspeed = "sim/flightmodel/position/indicated_airspeed";
                    msec = xpc.getDREF(dref_indicated_airspeed);
                }
                return String.valueOf(XPlaneConnection.msec2knots(msec[0]));
            } catch (IOException ex) {
                System.out.println("{ \"error\": \"" + ex.getMessage() + "\" }");
            }
        } else if (ac < MAX_XPLANE_AIRCRAFT_ID) {
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
     * Returns the vertical speed of an aircraft, in fpm
     * xplane 11 supports up-to 20 aircraft (ownship + 19 traffic)
     * ownship is ac 0
     */
    String getVSpeed (int ac) {
        if (ac == 0) {
            String dref = "sim/flightmodel/position/vh_ind_fpm";
            try {
                // get values from xplane
                float[] fpm = xpc.getDREF(dref); // TODO: check if this is fpm or fps, there is a discrepancy in http://www.xsquawkbox.net/xpsdk/docs/DataRefs.html, says units are "fpm" but then says "feet per second" 
                return String.valueOf(fpm[0]);
            } catch (IOException ex) {
                System.out.println("{ \"error\": \"" + ex.getMessage() + "\" }");
            }
        } else if (ac < MAX_XPLANE_AIRCRAFT_ID) {
            // The linear velocity of the aircraft is controlled by three values (see http://www.xsquawkbox.net/xpsdk/mediawiki/MovingThePlane)
            // sim/multiplayer/position/plane1_v_x
            // sim/multiplayer/position/plane1_v_y
            // sim/multiplayer/position/plane1_v_z
            // This determines both the aircraft's direction (in 3-d space) and its speed. 
            // Units are meters per second. 
            // This vector is in the world coordinate system
            // A velocity along the X axis moves the aircraft east no matter which way the aircraft is heading.
            String dref = "sim/multiplayer/position/plane" + ac + "_v_z";
            try {
                // get values from xplane
                float[] msec = xpc.getDREF(dref);
                return String.valueOf(XPlaneConnection.msec2fpm(msec[0]));
            } catch (IOException ex) {
                System.out.println("{ \"error\": \"" + ex.getMessage() + "\" }");
            }
        }
        return "0";
    }
    /**
     * Variant of getAircraftData, returns data only for aircraft that meet 
     * the minimum airspeed requirements (MIN_AIRSPEED)
     */
    String getFlyingAircraftData (int ac) {
        try {
            // Position is returned in the following order: Lat[deg], Lon[deg], Alt[m], Pitch[deg], Roll[deg], Yaw[deg], Gear[0=up, 1=down],
            double[] posi = xpc.getPOSI(ac);
            String lat = String.valueOf(posi[0]); // deg
            String lon = String.valueOf(posi[1]); // deg
            String alt = String.valueOf(XPlaneConnection.meters2feet(posi[2])); //ft

            String heading = getHeading(ac); // deg
            String airspeed = getAirspeed(ac); // knot
            if (Double.valueOf(airspeed) < MIN_AIRSPEED) {
                return null;
            }

            String vspeed = getVSpeed(ac); // fpm
            String name = getName(ac);
            String ans = "\"name\": \"" + name + "\",\n"
                + "\"lat\": { \"val\": \"" + lat + "\", \"units\": \"deg\" },\n"
                + "\"lon\": { \"val\": \"" + lon + "\", \"units\": \"deg\" },\n"
                + "\"alt\": { \"val\": \"" + alt + "\", \"units\": \"ft\" },\n"
                + "\"heading\": { \"val\": \"" + heading + "\", \"units\": \"deg\" },\n"
                + "\"airspeed\": { \"val\": \"" + airspeed + "\", \"units\": \"knot\" },\n"
                + "\"vspeed\": { \"val\": \"" + vspeed + "\", \"units\": \"fpm\" }";
            ans = "{\n" + ans + "\n}";
            log("getAircraftData(ac=" + ac + ")" + ans);
            return ans;
        } catch (IOException ex) {
            return "{ \"error\": \"" + ex.getMessage() + "\" }";
        }
    }
    /**
     * Gets aircraft data, including: name, position, heading, airpeed, vspeed
     */
    String getAircraftData (int ac) {
        try {
            // Position is returned in the following order: Lat[deg], Lon[deg], Alt[m], Pitch[deg], Roll[deg], Yaw[deg], Gear[0=up, 1=down],
            double[] posi = xpc.getPOSI(ac);
            String lat = String.valueOf(posi[0]); // deg
            String lon = String.valueOf(posi[1]); // deg
            String alt = String.valueOf(XPlaneConnection.meters2feet(posi[2])); //ft

            String heading = getHeading(ac); // deg
            String airspeed = getAirspeed(ac); // knot
            String vspeed = getVSpeed(ac); // fpm

            String name = getName(ac);
            String ans = "\"name\": \"" + name + "\",\n"
                + "\"lat\": { \"val\": \"" + lat + "\", \"units\": \"deg\" },\n"
                + "\"lon\": { \"val\": \"" + lon + "\", \"units\": \"deg\" },\n"
                + "\"alt\": { \"val\": \"" + alt + "\", \"units\": \"ft\" },\n"
                + "\"heading\": { \"val\": \"" + heading + "\", \"units\": \"deg\" },\n"
                + "\"airspeed\": { \"val\": \"" + airspeed + "\", \"units\": \"knot\" },\n"
                + "\"vspeed\": { \"val\": \"" + vspeed + "\", \"units\": \"fpm\" }";
            ans = "{\n" + ans + "\n}";
            log("getAircraftData(ac=" + ac + ")" + ans);
            return ans;
        } catch (IOException ex) {
            return "{ \"error\": \"" + ex.getMessage() + "\" }";
        }
    }

    /**
     * Set aircraft airspeed
     * airspeed [knot]
     */
    boolean setAircraftAirspeed (int ac, String airspeed) {
        // x y z are in the world coordinate system
        // +vx moves the aircraft east no matter which way the aircraft is heading
        // +vy moves the aircraft north
        // +vz moves the aircraft towards the sky
        // here we use a simplified logic for setting the speed vector because heading is forced using sendPOSI -- this is ok as long as the physics engine is disabled
        float[] vx = { 0 };
        float[] vy = { (float) knots2msec(Double.parseDouble(airspeed)) };
        if (ac == 0) {
            log("Setting airspeed of ac" + ac + " to " + airspeed + "knot");
            float[] msec = { (float) knots2msec(Double.parseDouble(airspeed)) };
            float[][] values = { msec, msec, vx, vy };
            String[] drefs = {
                "sim/flightmodel/position/indicated_airspeed",
                "sim/flightmodel/position/indicated_airspeed2",

                "sim/flightmodel/position/local_vx", // m/s
                "sim/flightmodel/position/local_vy" // m/s
            };
            try {
                xpc.sendDREFs(drefs, values);
            } catch (IOException ex) {
                System.out.println("{ \"error\": \"" + ex.getMessage() + "\" }");
                return false;
            }
            return true;
        } else if (ac > 0) {
            // else, set velocity of traffic aircraft.
            // we need to set plane<ac>_v_x y z in this case
            float[][] values = { vx, vy };
            String[] drefs = {
                "sim/flightmodel/position/local_vx", // m/s
                "sim/flightmodel/position/local_vy" // m/s
            };
            try {
                xpc.sendDREFs(drefs, values);
            } catch (IOException ex) {
                System.out.println("{ \"error\": \"" + ex.getMessage() + "\" }");
                return false;
            }
            return true;
        }
        log("Warning: unable to set speed of ac " + ac + " (ac number must be non-negative)");
        return false;
    }

    /**
     * Set aircraft vertical speed
     * vspeed [fpm]
     */
    boolean setAircraftVerticalSpeed (int ac, String vspeed) {
        // x y z are in the world coordinate system
        // +vx moves the aircraft east no matter which way the aircraft is heading
        // +vy moves the aircraft north
        // +vz moves the aircraft towards the sky
        float[] vz = { (float) fpm2msec(Double.parseDouble(vspeed)) };
        if (ac == 0) {
            log("Setting vspeed of ac" + ac + " to " + vspeed + "knot");
            float[] fpm = { Float.parseFloat(vspeed) };
            float[][] values = { fpm, fpm };
            String[] drefs = {
                "sim/flightmodel/position/vh_ind_fpm",
                "sim/flightmodel/position/vh_ind_fpm2",
                "sim/flightmodel/position/local_vz" // m/s
            };
            try {
                xpc.sendDREFs(drefs, values);
            } catch (IOException ex) {
                System.out.println("{ \"error\": \"" + ex.getMessage() + "\" }");
                return false;
            }
            return true;
        } else if (ac > 0) {
            // else, set velocity of traffic aircraft.
            // we need to set plane<ac>_v_x y z in this case
            float[][] values = { vz };
            String[] drefs = {
                "sim/multiplayer/position/plane" + ac + "_v_z" // m/s
            };
            try {
                xpc.sendDREFs(drefs, values);
            } catch (IOException ex) {
                System.out.println("{ \"error\": \"" + ex.getMessage() + "\" }");
                return false;
            }
            return true;
        }
        log("Warning: unable to set speed of ac " + ac + " (ac number must be non-negative)");
        return false;
    }

    /**
     * Set aircraft airspeed
     * airspeed [knot]
     * vspeed [fpm]
     */
    boolean setAircraftSpeed (int ac, String airspeed, String vspeed) {
        log("Setting speed of " + getName(ac) + ": airspeed=" + airspeed + "knot vspeed=" + vspeed + "fpm");
        // x y z are in the world coordinate system
        // +vx moves the aircraft east no matter which way the aircraft is heading
        // +vy moves the aircraft south
        // +vz moves the aircraft towards the sky
        // here we use a simplified logic for setting the speed vector because heading is forced using sendPOSI -- this is ok as long as the physics engine is disabled
        float[] vx = { 0 };
        float[] vy = { (float) knots2msec(Double.parseDouble(airspeed)) };
        float[] vz = { (float) fpm2msec(Double.parseDouble(vspeed)) };
        log("[XPlaneConnection] vx vy vz = " + vx[0] + " " + vy[0] + " " + vz[0]);
        if (ac == 0) {
            float[] airspeed_msec = { (float) knots2msec(Double.parseDouble(airspeed)) };
            float[] vspeed_fpm = { Float.parseFloat(vspeed) };
            float[][] values = { airspeed_msec, airspeed_msec, vspeed_fpm, vspeed_fpm, vx, vy, vz };
            String[] drefs = {
                "sim/flightmodel/position/indicated_airspeed", // m/s
                "sim/flightmodel/position/indicated_airspeed2", // m/s

                "sim/flightmodel/position/vh_ind_fpm",  // fpm
                "sim/flightmodel/position/vh_ind_fpm2",  // fpm

                "sim/flightmodel/position/local_vx", // m/s
                "sim/flightmodel/position/local_vy", // m/s
                "sim/flightmodel/position/local_vz" // m/s                
            };
            try {
                xpc.sendDREFs(drefs, values);
            } catch (IOException ex) {
                System.out.println("{ \"error\": \"" + ex.getMessage() + "\" }");
                return false;
            }
            return true;
        } else if (ac > 0) {
            // else, set velocity of traffic aircraft.
            // we need to set plane<ac>_v_x y z in this case
            float[][] values = { vx, vy, vz };
            String[] drefs = {
                "sim/multiplayer/position/plane" + ac + "_v_x", // m/s
                "sim/multiplayer/position/plane" + ac + "_v_y", // m/s
                "sim/multiplayer/position/plane" + ac + "_v_z" // m/s
            };
            try {
                xpc.sendDREFs(drefs, values);
            } catch (IOException ex) {
                System.out.println("{ \"error\": \"" + ex.getMessage() + "\" }");
                return false;
            }
            return true;
        }
        log("Warning: unable to set speed of ac " + ac + " (ac number must be non-negative)");
        return false;
    }
    /**
     * Sets planet mars
     */
    boolean setPlanetMars () {
        log("Setting scenery on planet Mars");
        try {
            xpc.sendDREF("sim/graphics/scenery/current_planet", 1);
        } catch (IOException ex) {
            System.out.println("{ \"error\": \"" + ex.getMessage() + "\" }");
            return false;
        }
        return true;
    }
    /**
     * Sets planet earth
     */
    boolean setPlanetEarth () {
        log("Setting scenery on Earth");
        try {
            xpc.sendDREF("sim/graphics/scenery/current_planet", 0);
        } catch (IOException ex) {
            System.out.println("{ \"error\": \"" + ex.getMessage() + "\" }");
            return false;
        }
        return true;
    }
    /**
     * Disables xplane physics engine
     */
    boolean disablePhysicsEngine () {
        if (physics_enabled) {
            log("Disabling physics engine...");
            float[] planepath_flags = {
                1,1,1,1,1,1,1,1,1,1,
                1,1,1,1,1,1,1,1,1,1
            };
            try {
                xpc.sendDREF("sim/operation/override/override_planepath", planepath_flags);
                physics_enabled = false;
            } catch (IOException ex) {
                System.out.println("{ \"error\": \"" + ex.getMessage() + "\" }");
                return false;
            }
        } else {
            log("Physics engine already disabled");
        }
        return true;
    }

    /**
     * Enables xplane physics engine
     */
    boolean enablePhysicsEngine () {
        if (!physics_enabled) {
            log("Enabling physics engine...");
            float[] planepath_flags = {
                0,0,0,0,0,0,0,0,0,0,
                0,0,0,0,0,0,0,0,0,0
            };
            try {
                xpc.sendDREF("sim/operation/override/override_planepath", planepath_flags);
                physics_enabled = true;
            } catch (IOException ex) {
                System.out.println("{ \"error\": \"" + ex.getMessage() + "\" }");
                return false;
            }
        } else {
            log("Physics engine already enabled");
        }
        return true;
    }

    /**
     * Pauses the xplane simulation
     */
    boolean pauseSim () {
        log("Pausing simulation...");
        try {
            xpc.sendDREF("sim/time/sim_speed", 0);
        } catch (IOException ex) {
            System.out.println("{ \"error\": \"" + ex.getMessage() + "\" }");
            return false;
        }
        return true;
    }

    /**
     * Resumes the xplane simulation
     */
    boolean resumeSim () {
        log("Resuming simulation...");
        try {
            xpc.sendDREF("sim/time/sim_speed", 1);
        } catch (IOException ex) {
            System.out.println("{ \"error\": \"" + ex.getMessage() + "\" }");
            return false;
        }
        return true;
    }

    /**
     * Utility function, created for testing purposes
     */
    boolean test (int ac) {
        log("Test example start...");
        for (int i = 0; i < 100; i++) {
            try {
                double[] posi = xpc.getPOSI(ac);
                posi[0] += 0.01;
                setAircraftPosition(ac, getName(ac), String.valueOf(posi[0]), String.valueOf(posi[1]), String.valueOf(posi[2]));
                try { Thread.sleep(1000); }
                catch (InterruptedException ex) {
                    System.out.println("{ \"error\": \"" + ex.getMessage() + "\" }");
                    return false;
                }
            } catch (IOException ex) {
                System.out.println("{ \"error\": \"" + ex.getMessage() + "\" }");
                return false;
            }
        }
        log("Test example end");
        return true;
    }

    /**
     * exec xplane connect
     */
    public void exec (String[] args) {
        try {
            Thread.sleep(16);
        } catch (InterruptedException ex) { }
        // parse args
        if (args != null && args.length > 0) {
            if (args[0].equals("-disablePhysicsEngine")) {
                disablePhysicsEngine();
            } else if (args[0].equals("-enablePhysicsEngine")) {
                enablePhysicsEngine();
            } else if (args[0].equals("-setPlanetMars")) {
                setPlanetMars();
            } else if (args[0].equals("-setPlanetEarth")) {
                setPlanetEarth();
            } else if (args[0].equals("-pauseSim")) {
                pauseSim();
            } else if (args.length > 1) {
                if (args[0].equals("-setPosition") || args[0].equals("-setOwnshipPosition")) {
                    // System.err.println("[XPlaneConnection] " + args[0] + " " + args[1]);
                    String[] pos = args[1].split(",");
                    String name = pos[0].trim();
                    String lat = pos[1].trim();
                    String lon = pos[2].trim();
                    String alt = pos[3].trim();
                    String heading = pos.length > 4 ? pos[4].trim() : "0";
                    String bank = pos.length > 5 ? pos[5].trim() : "0";
                    setOwnshipPosition(name, lat, lon, alt, heading, bank);
                } else if (args[0].equals("-setSpeed") || args[0].equals("-setOwnshipSpeed")) { 
                    String[] pos = args[1].split(",");
                    String airspeed = pos[0].trim();
                    if (args.length > 1) {
                        String vspeed = pos[1].trim();
                        setOwnshipSpeed(airspeed, vspeed);                            
                    } else {
                        setOwnshipAirspeed(airspeed);
                    }
                } else if (args[0].equals("-setTrafficPosition")) {
                    String[] pos = args[1].split(",");
                    int SIZE = 5; // name, lat, lon, alt, heading
                    int n = pos.length / SIZE;
                    for (int i = 0; i < n; i++) {
                        int offset = i * SIZE;
                        String name = pos[offset + 0].trim();
                        String lat = pos[offset + 1].trim();
                        String lon = pos[offset + 2].trim();
                        String alt = pos[offset + 3].trim();
                        String heading = pos[offset + 4].trim();
                        setAircraftPosition(i + 1, name, lat, lon, alt, heading);
                    }
                } else if (args[0].equals("-setTrafficSpeed")) {
                    String[] pos = args[1].split(",");
                    int SIZE = 2; // airspeed, vspeed
                    int n = pos.length / SIZE;
                    for (int i = 0; i < n; i++) {
                        int offset = i * SIZE;
                        String airspeed = pos[offset + 0].trim();
                        String vspeed = pos[offset + 1].trim();
                        setAircraftSpeed(i + 1, airspeed, vspeed);
                    }
                } else if (args[0].equals("-daa")) {
                    String[] pos = args[1].split(",");
                    int SIZE = 8; // name, lat, lon, alt, heading, roll, airspeed, vspeed
                    int n = pos.length / SIZE;
                    // set all positions first, to avoid rendering delays
                    for (int i = 0; i < n; i++) {
                        int offset = i * SIZE;
                        String name = pos[offset + 0].trim();
                        String lat = pos[offset + 1].trim();
                        String lon = pos[offset + 2].trim();
                        String alt = pos[offset + 3].trim();
                        String heading = pos[offset + 4].trim();
                        String roll = pos[offset + 5].trim();
                        setAircraftPosition(i, name, lat, lon, alt, heading, roll);
                    }
                    // set speed
                    for (int i = 0; i < n; i++) {
                        int offset = i * SIZE;
                        String airspeed = pos[offset + 6].trim();
                        String vspeed = pos[offset + 7].trim();
                        setAircraftSpeed(i, airspeed, vspeed);
                    }
                } else {
                    log("Unrecognized parameter " + args[0]);
                }
            } else {
                log("Unrecognized parameter " + args[0]);
            }
        } else {
            // print fligth data on stdout
            String ans = getFlightData();
            System.out.println(ans);
        }
    }

    /**
     * Main method
     */
    public static void main (String[] args) {
        XPlaneConnection xplane = new XPlaneConnection();
        boolean success = xplane.activate();
        if (success) {
            xplane.exec(args);
        }
    }
}
