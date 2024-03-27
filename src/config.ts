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

export const DAA_FILE_EXTENSIONS: string[] = [ ".daa", ".txt", ".xyz" ];

// screen aspect ratio
export type ScreenType = "21:9" | "ultra-widescreen" | "16:9" | "widescreen" | "4:3" | "standard";

/**
 * Configuration options for danti-display
 */

// default DANTi address and port
export const DANTI_ADDRESS: string = "0.0.0.0"; // default is localhost
export const DANTI_PORT: number = 8082;

// whether danti-app should use https to connect to the server (this is not necessary when using localhost)
export const USE_HTTPS: boolean = false;

// whether debug messages are printed, this may slow down the simulation
export const DBG: boolean = true;
export const VERBOSE_DBG: boolean = false;
export const ENABLE_PROFILER: boolean = true;

// whether we are running danti on a toughpad
export const TOUGHPAD: boolean = false;

// screen aspect ration
export const SCREEN: ScreenType = "widescreen";

// whether we want to start danti in full screen / maximized
export const FULLSCREEN: boolean = false;
export const MAXIMIZED: boolean = true;
export const WINDOW_RESIZE_DELAY: number = 500; //ms

// position of the danti window, can be used to place danti on a specific screen
export const MARGIN_TOP: number = 0; // this value can be overridden with the danti option "top", e.g., see run-danti target in the makefile
export const MARGIN_LEFT: number = 0; // this value can be overridden with the danti option "left", e.g., see run-danti target in the makefile

// default frames per second, used to smooth the animation of the traffic display
export const FPS: number = 8;

// whether the traffic display should interpolate traffic data, e.g., to compensate low display update rates (e.g., 1Hz) and so have a smoother rendering
export const INTERPOLATE: boolean = true;

// stale threshold for traffic aircraft, in seconds (0=disabled)
export const STALE_THRESHOLD: number = 10; // [s]

// whether heading can be updated reliably at low speeds (<0.01kn)
export const UPDATE_HEADING_AT_LOW_SPEEDS: boolean = true;

// whether DANTi should be terminated upon disconnection of client or data source
export const TERMINATE_ON_DISCONNECT: boolean = true;

// DANTi configuration
export const DANTI_CONFIG: string = "DANTi_SL3.conf"
// whether the special daa configutaion SL3 should be used -- when using this configuration, DANTi suppresses warning alerts for altitudes below THRESHOLD_ALT_SL3
export const USE_TCAS_SL3: boolean = true;
// altitude threshold below which we suppress warning alerts
// TODO: the altitude threshold should not be absolute altitude but above ground level (AGL) altitude
export const THRESHOLD_ALT_SL3: number = 400; //ft

// whether the proximity filter should be used to prevent the computation of daa bands for traffic aicraft that is far away -- this is done to improve performance
export const USE_PROXIMITY_FILTER: boolean = true;
export const TRAFFIC_DETECTION_RANGE_H: number = 10; // [nmi]
export const TRAFFIC_DETECTION_RANGE_V: number = 6000; // [ft]

// step size for tape displays
export const AIRSPEED_STEP: number = 20; // [kn]
export const ALT_STEP: number = 100; // [ft]
export const VSPEED_RANGE: number = 2000; // [ft/min]
