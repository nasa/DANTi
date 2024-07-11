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

import { AirspeedTape } from '../daa-displays/daa-airspeed-tape';
import { AltitudeTape } from '../daa-displays/daa-altitude-tape';
import { VerticalSpeedTape } from '../daa-displays/daa-vertical-speed-tape';
import { Compass } from '../daa-displays/daa-compass';
import { HScale } from '../daa-displays/daa-hscale';
import { WindIndicator } from '../daa-displays/daa-wind-indicator';
import { ViewOptions } from '../daa-displays/daa-view-options';

import { DEFAULT_MAP_WIDTH, InteractiveMap, MAP_WIDESCREEN_WIDTH } from '../daa-displays/daa-interactive-map';
import { LLAData, ScenarioDataPoint, LatLonAlt, DAA_AircraftDescriptor, AlertLevel } from '../daa-displays/utils/daa-types';
import { Bands, downgrade_alerts, inhibit_bands, inhibit_resolutions } from '../daa-displays/daa-utils';
import * as utils from '../daa-displays/daa-utils';
import { DaaVoice, Guidance, GuidanceKind } from '../daa-displays/daa-voice';

// import { uuid } from "../daa-displays/utils/daa-utils";
import { DAAClient } from "../daa-displays/utils/daa-client";
import { 
    DantiRequest, DantiRequestType, DantiResponse, DANTI_URL, 
    RegisterResponse, RenderRequest, SetFlightPlanRequest, AvionicsData
} from "./danti-interface";
import { 
    INTERPOLATE_TRAFFIC,
	KEEP_LAST_VALID_HEADING, ScreenType, THRESHOLD_ALT_SL3, 
    UPDATE_HEADING_AT_LOW_SPEEDS, USE_MAGHEADING, USE_TCAS_SL3, 
    VERBOSE_DBG
} from '../config';
import { TailNumberIndicator } from '../daa-displays/daa-tail-number';
import { LayeringMode } from '../daa-displays/daa-map-components/leaflet-aircraft';
 
export interface DantiWidgets { 
    map: InteractiveMap, 
    compass: Compass, 
    airspeedTape: AirspeedTape, 
    altitudeTape: AltitudeTape, 
    verticalSpeedTape: VerticalSpeedTape,
    wind: WindIndicator,
    voice: DaaVoice,
    tailNumber: TailNumberIndicator
}
export interface DantiData {
    avionics?: AvionicsData,
    flightData: LLAData, 
    bands: ScenarioDataPoint 
}

// flag indicating whether the display should be widescreen
const enable_sound: boolean = false;
// display padding, used for centering the options and view controls shown at the top/bottom of the danti display
const PADDING: number = 13; //px
// const UPDATE_FREQUENCY: number = utils.DEFAULT_TRAFFIC_UPDATE_INTERVAL; // in seconds
const ENABLE_FULL_360: boolean = false;
// const USE_TCAS_SL3: boolean = true;
// // altitude threshold below which we suppress warning alerts
// // TODO: the altitude threshold should not be absolute altitude but above ground level (AGL) altitude
// const THRESHOLD_ALT_SL3: number = 1000; //ft

// utility function, checks if the requested display is widescreen
export function isWideScreen (screen: ScreenType): boolean {
    return screen === "21:9" || screen === "ultra-widescreen"
        || screen === "16:9" || screen === "widescreen";
}
// utility function, checks if the requested display is widescreen
export function isUltraWideScreen (screen: ScreenType): boolean {
    return screen === "21:9" || screen === "ultra-widescreen";
}

// animation duration for the display elements
export const ANIMATE_TRAFFIC: boolean = true;
export const TRAFFIC_ANIMATION_DURATION: number = INTERPOLATE_TRAFFIC ? 2 : 0.25; //[s]
export const ANIMATE_COMPASS: boolean = true;
export const COMPASS_ANIMATION_DURATION: number = INTERPOLATE_TRAFFIC ? 2 : 0.25; //[s]
export const SPEED_TAPES_ANIMATION_DURATION: number = INTERPOLATE_TRAFFIC ? 2 : 0.25; //[s]

/**
 * DantiDisplay implements defines the visual appearance and widgets of the Danti display
 */
export class DantiDisplay {
    protected widgets: DantiWidgets;
    protected client: DantiClient;
    protected lastTailNumber: string = "";

    /**
     * Constructor
     * @param opt.parent ID of the DOM element where the display will be rendered
     * @param opt.toughpad whether the display will be rendered on a toughpad
     */
    constructor (opt?: { parent?: string, toughpad?: boolean, screen?: ScreenType }) {
        opt = opt || {};
        opt.screen = opt.screen || "16:9"; // default screen type is widescreen
        const parent: string = opt?.parent || "daa-disp";
        const widescreen: boolean = isWideScreen(opt.screen);
        const ultra_widescreen: boolean = isUltraWideScreen(opt.screen) || opt.toughpad;

        // interactive map
        const map: InteractiveMap = new InteractiveMap("map", { 
            top: 2, 
            left: 6 
        }, { 
            parent, 
            widescreen,
            engine: "leafletjs",
            trafficTraceVisible: false,
            layeringMode: LayeringMode.byAlertLevel,
            animate: ANIMATE_TRAFFIC,
			duration: TRAFFIC_ANIMATION_DURATION
        });
        // wind indicator
        // const wind: WindIndicator = new WindIndicator("wind", {
        //     top: 690, 
        //     left: isWideScreen(opt.screen) ? 48 : 195 
        // }, { parent });
        // tail number indicator
        const tailNumber: TailNumberIndicator = new TailNumberIndicator("tail", {
            top: 100,
            left: isWideScreen(opt.screen) ? 48 : 195
        }, { parent: "daa-disp"});
        // map heading is controlled by the compass
        const compassDivName: string = map.getCompassDivName();
        const indicatorsDivName: string = map.getIndicatorsDivName();
        const ownshipDivName: string = map.getOwnshipDivName();
        console.log({ compassDivName, indicatorsDivName, ownshipDivName });
        const compass: Compass = new Compass("compass", {
            top: 110, left: widescreen ? 434 : 210 
        }, { 
            parent: compassDivName, 
            indicatorsDiv: indicatorsDivName,
            ownshipDiv: ownshipDivName, // the ownship will be rendered above traffic and compass
            maxWedgeAperture: ENABLE_FULL_360 ? 15 : 0, 
            map,
            animate: ANIMATE_COMPASS,
			duration: COMPASS_ANIMATION_DURATION
        });
        // set compass to magnetic heading
        compass.magneticHeading(true);
        // map zoom is controlled by nmiSelector
        const hscale: HScale = new HScale("hscale", {
            top: ultra_widescreen ? 825
                    : widescreen ? 851 
                    : 800, 
            left: widescreen ? 7 : 13, 
            width: widescreen ? MAP_WIDESCREEN_WIDTH : DEFAULT_MAP_WIDTH - PADDING
        }, { parent, map, compass, hScroll: false });
        // set default zoom level to 1NM by default
        hscale.checkRadio(8);

        // map view options
        const viewOptions: ViewOptions = new ViewOptions("view-options", { 
            top: ultra_widescreen ? -18
                    : widescreen ? -44 
                    : 0, 
            left: widescreen ? 7 : 13, 
            width: widescreen ? MAP_WIDESCREEN_WIDTH : DEFAULT_MAP_WIDTH - PADDING }, {
            labels: [
                "nrthup", "vfr-map", "call-sign"//, "well-clear"//, "blobs"
            ], parent, compass, map });
        // select call-sign and nrthup by default
        viewOptions.check("call-sign");
        // viewOptions.check("nrthup");
        // viewOptions.check("vfr-map");
        
        // voice feedback
        const voice: DaaVoice = new DaaVoice();
        // create remaining display widgets
        const airspeedTape = new AirspeedTape("airspeed", { top: 100, left: widescreen ? 194 : 100 }, { parent: "daa-disp", maxWedgeAperture: ENABLE_FULL_360 ? 50 : 0 });
        const altitudeTape = new AltitudeTape("altitude", { top: 100, left: widescreen ? 1154 : 833 }, { parent: "daa-disp", maxWedgeAperture: ENABLE_FULL_360 ? 300 : 0 });
        const verticalSpeedTape = new VerticalSpeedTape("vertical-speed", { top: 210, left: widescreen ? 1308 : 981 }, { parent: "daa-disp", verticalSpeedRange: 2000, maxWedgeAperture: ENABLE_FULL_360 ? 500 : 0 });

        // settings necessary to create a smooth animation
		compass?.animationDuration(COMPASS_ANIMATION_DURATION);
		map?.animationDuration(TRAFFIC_ANIMATION_DURATION);
		airspeedTape?.animationDuration(SPEED_TAPES_ANIMATION_DURATION);
		verticalSpeedTape?.animationDuration(SPEED_TAPES_ANIMATION_DURATION);

        if (opt.toughpad) {
            // adjust position & size, these values are good for 1920x1200
            if (ultra_widescreen) {
                $(`#${parent}`).css({ top: "42px", left: "-14px", transform: "scale(2.29)"});
            } else {
                $(`#${parent}`).css({ top: "106px", left: "100px", transform: "scale(2.02)"});
            }
            $("#daa-theme").css("display", "none");
        } else {
            if (!widescreen) {
                $(`#${parent}`).css({ left: "354px" });
            }
            $("#daa-theme").css("display", "block");
        }

        // save widgets
        this.widgets = {
            map, airspeedTape, altitudeTape, verticalSpeedTape, wind: null, compass, voice, tailNumber
        };
        // create client to communicated with the back-end
        this.client = new DantiClient();
    }
    /**
     * Activate connection with the server
     * This function defines all message handlers
     */
    async activate (opt?: { https?: boolean }): Promise<boolean> {
        let success: boolean = await this.client.activate(opt);
        if (success) {
            success = await this.client.sendRequest("register-danti");
            if (success) {
                this.client.getWebSocket().onmessage = (evt): void => {
                    if (evt) {
                        const req: RenderRequest | SetFlightPlanRequest = evt?.data ? JSON.parse(evt.data) : null;
                        if (req?.type) {
                            try {
                                switch (req.type) {
                                    case "render-request": {
                                        const data: DantiData = req.data;
                                        // if (req.data?.avionics) { console.log(`[danti-display] Using avionics data`, { avionics: data.avionics })}
                                        this.render(data);
                                        break;
                                    }
                                    case "flight-plan": {
                                        const data: utils.FlightPlan = req.data;
                                        this.widgets.map.setFlightPlan(data);
                                        this.widgets.map.hideFlightPlan();
                                        console.log("[danti-display] loaded flight plan", data);
                                        break;
                                    }
                                    default: {
                                        console.warn("[danti-display] Warning: unknown message type", req);
                                        break;
                                    }
                                }
                            } catch (error) {
                                console.error("[danti-display] Error while parsing render request", evt, error);
                            }
                        } else {
                            console.warn("[danti-display] Warning: unknown request", req);
                        }
                    }
                }
            }
        }
        return success;
    }
    /**
     * Render display elements
     */
    render (data: DantiData): void {
        if (data?.flightData && this.widgets) {
            const daaSymbols: string[] = [ "daa-target", "daa-traffic-monitor", "daa-traffic-avoid", "daa-alert" ]; // 0..3
            const danti: DantiWidgets = this.widgets;
            const flightData: LLAData = data.flightData;
            if (flightData.ownship.id === "--") {
                // reset display -- ownship has not been assigned yet
                this.lastTailNumber = flightData.ownship.id;
                danti.tailNumber?.setTailNumber(flightData.ownship.id);
                danti.map?.resetAirspace();
                danti.map?.removeGeoFence();
                danti.compass?.animationDuration(0);
                danti.map?.animationDuration(0);
                danti.airspeedTape?.animationDuration(0);
                danti.verticalSpeedTape?.animationDuration(0);
                if (!KEEP_LAST_VALID_HEADING) {
                    danti.compass.setCompass(0);
                    danti.compass.magVar(0);
                }
                danti.airspeedTape?.setAirSpeed(0, AirspeedTape.units.knots);
                danti.verticalSpeedTape?.setVerticalSpeed(0);
                danti.altitudeTape?.setAltitude(0, AltitudeTape.units.ft);
            } else {
                const magvar: number = USE_MAGHEADING && isFinite(+data.avionics?.magvar?.val) ? +data.avionics.magvar.val : 0;
                const bands: ScenarioDataPoint = data.bands;
                if (VERBOSE_DBG) { console.log(`[danti-display] Rendering `, data); }

                // try to use avionics data if they are available
                const lat : number = isFinite(+data?.avionics?.lat?.val) ? +data.avionics.lat.val : +flightData.ownship.s.lat;
                const lon : number = isFinite(+data?.avionics?.lon?.val) ? +data.avionics.lon.val : +flightData.ownship.s.lon;
                const alt : number = isFinite(+data?.avionics?.alt?.val) ? +data.avionics.alt.val : +flightData.ownship.s.alt;
                const pos: LatLonAlt<number> = { lat, lon, alt };
                danti.map?.setPosition(pos);
                // set tail number
                danti.tailNumber?.setTailNumber(flightData.ownship.id);
                if (this.lastTailNumber !== flightData.ownship.id) {
                    // update last tail number and remove all traffic rendered on the display
                    this.lastTailNumber = flightData.ownship.id;
                    danti.map?.resetAirspace();
                    danti.compass?.animationDuration(0);
                    danti.map?.animationDuration(0);
                    danti.airspeedTape?.animationDuration(0);
                    danti.verticalSpeedTape?.animationDuration(0);
                } else {
                    // settings necessary to create a smooth animation
                    const animationDuration: number = 2; // s
                    danti.compass?.animationDuration(animationDuration);
                    danti.map?.animationDuration(animationDuration);
                    danti.airspeedTape?.animationDuration(animationDuration);
                    danti.verticalSpeedTape?.animationDuration(animationDuration);
                }
                if (bands && !bands.Ownship) { console.warn("Warning: using ground-based data for the ownship"); }

                // try to use avionics data if they are available, they will provide magnetic heading, true airspeed, and vertical speed
                const heading: number = isFinite(+bands?.Ownship?.acstate?.heading?.val) ? +bands.Ownship.acstate.heading.val : Compass.v2deg(data.flightData.ownship.v);
                const airspeed: number = isFinite(+data.avionics?.tas?.val) ? +data.avionics.tas.val
                    : isFinite(+bands?.Ownship?.acstate?.airspeed?.val) ? +bands.Ownship.acstate.airspeed.val : AirspeedTape.v2gs(data.flightData.ownship.v);
                const vspeed: number = isFinite(+data.avionics?.vspeed?.val) ? +data.avionics.vspeed.val
                    : isFinite(+bands?.Ownship?.acstate?.verticalspeed?.val) ? +bands.Ownship.acstate.verticalspeed.val : +data.flightData.ownship.v.z;
                if (UPDATE_HEADING_AT_LOW_SPEEDS || airspeed > 0.01) { // this check avoids spurious compass rose turns when airspeed is close to zero
                    danti.compass.setCompass(heading);
                    danti.compass.magVar(magvar);
                }
                danti.airspeedTape?.setAirSpeed(airspeed, AirspeedTape.units.knots);
                danti.verticalSpeedTape?.setVerticalSpeed(vspeed);
                // the current version of the altitude tape does not support negative altitudes
                danti.altitudeTape?.setAltitude(alt > 0 ? alt : 0, AltitudeTape.units.ft);

                // flag indicating whether we are mimicking TCAS suppression of warning alerts below a certain altitude
                const force_caution: boolean = alt < THRESHOLD_ALT_SL3 && USE_TCAS_SL3;
                if (force_caution) {
                    downgrade_alerts({ to: AlertLevel.AVOID, alerts: bands?.Alerts?.alerts });
                    inhibit_bands({ bands });
                    inhibit_resolutions({ bands });
                }
                // compute max alert and collect aircraft alert descriptors
                let max_alert: number = 0;
                const traffic: DAA_AircraftDescriptor[] = flightData.traffic.map((data, index) => {
                    const alert_level: number = bands.Alerts.alerts[index].alert_level;
                    const desc: DAA_AircraftDescriptor = {
                        callSign: data.id,
                        s: data.s,
                        v: data.v,
                        symbol: daaSymbols[alert_level]
                    };
                    if (alert_level > max_alert) {
                        max_alert = alert_level;
                    }
                    return desc;
                });

                // console.log(`Flight data`, flightData);
                if (bands) {
                    const compassBands: Bands = utils.bandElement2Bands(bands["Heading Bands"]);
                    danti.compass?.setBands(compassBands);
                    const airspeedBands: Bands = utils.bandElement2Bands(bands["Horizontal Speed Bands"]);
                    danti.airspeedTape?.setBands(airspeedBands, AirspeedTape.units.knots);
                    // DANTi should display either vspeed bands or altitude bands, not both of them -- we choose to show vspeed bands
                    const vspeedBands: Bands = utils.bandElement2Bands(bands["Vertical Speed Bands"]);
                    danti.verticalSpeedTape?.setBands(vspeedBands);
                    // const altitudeBands: Bands = utils.bandElement2Bands(bands["Altitude Bands"]);
                    // danti.altitudeTape.setBands(altitudeBands, AltitudeTape.units.ft);

                    const wedgePersistenceEnabled: boolean = false;

                    // set resolutions
                    // show wedge only for recovery bands
                    if (compassBands?.RECOVERY || (wedgePersistenceEnabled && max_alert > 2)) {
                        danti.compass?.setBug(bands["Horizontal Direction Resolution"], {
                            wedgeConstraints: compassBands.RECOVERY,
                            resolutionBugColor: utils.bugColors["RECOVERY"] // "green"
                        });
                    } else {
                        danti.compass?.setBug(bands["Horizontal Direction Resolution"], {
                            wedgeAperture: 0
                        });
                    }
                    if (airspeedBands?.RECOVERY || (wedgePersistenceEnabled && max_alert > 2)) {
                        danti.airspeedTape?.setBug(bands["Horizontal Speed Resolution"], {
                            wedgeConstraints: airspeedBands.RECOVERY,
                            resolutionBugColor: utils.bugColors["RECOVERY"] // "green"
                        });
                    } else {
                        danti.airspeedTape?.setBug(bands["Horizontal Speed Resolution"], {
                            wedgeAperture: 0
                        });
                    }
                    // if (altitudeBands?.RECOVERY || (wedgePersistenceEnabled && max_alert > 2)) {
                    //     danti.altitudeTape.setBug(bands["Altitude Resolution"], {
                    //         wedgeConstraints: altitudeBands.RECOVERY,
                    //         resolutionBugColor: utils.bugColors["RECOVERY"] // "green"
                    //     });
                    // } else {
                    //     danti.altitudeTape.setBug(bands["Altitude Resolution"], {
                    //         wedgeAperture: 0
                    //     });
                    // }
                    if (vspeedBands?.RECOVERY || (wedgePersistenceEnabled && max_alert > 2)) {
                        danti.verticalSpeedTape?.setBug(bands["Vertical Speed Resolution"], {
                            wedgeConstraints: vspeedBands.RECOVERY,
                            resolutionBugColor: utils.bugColors["RECOVERY"] // "green"
                        });
                    } else {
                        danti.verticalSpeedTape?.setBug(bands["Vertical Speed Resolution"], {
                            wedgeAperture: 0
                        });
                    }
                }
                // set contours
                danti.map.removeGeoFence();
                if (bands && bands.Contours && bands.Contours.data) {
                    for (let i = 0; i < bands.Contours.data.length; i++) {
                        if (bands.Contours.data[i].polygons) {
                            for (let j = 0; j < bands.Contours.data[i].polygons.length; j++) {
                                const perimeter: LatLonAlt<number | string>[] = bands.Contours.data[i].polygons[j];
                                if (perimeter && perimeter.length) {
                                    const floor: { top: number, bottom: number } = {
                                        top: +perimeter[0].alt + 20,
                                        bottom: +perimeter[0].alt - 20
                                    }
                                    // add geofence to the map
                                    danti.map?.addContour(`${bands.Contours.data[i].ac}-${i}-${j}`, perimeter, floor, {
                                        showLabel: false
                                    });
                                }
                            }
                        }
                    }
                }
                // set hazard zones
                if (bands && bands["Hazard Zones"] && bands["Hazard Zones"].data) {
                    for (let i = 0; i < bands["Hazard Zones"].data.length; i++) {
                        if (bands["Hazard Zones"].data[i].polygons) {
                            for (let j = 0; j < bands["Hazard Zones"].data[i].polygons.length; j++) {
                                const perimeter: LatLonAlt<number | string>[] = bands["Hazard Zones"].data[i].polygons[j];
                                if (perimeter && perimeter.length) {
                                    const floor: { top: number, bottom: number } = {
                                        top: +perimeter[0].alt + 20,
                                        bottom: +perimeter[0].alt - 20
                                    }
                                    // add geofence to the map
                                    danti.map?.addProtectedArea(`${bands["Hazard Zones"].data[i].ac}-${i}-${j}`, perimeter, floor, {
                                        showLabel: false
                                    });
                                }
                            }
                        }
                    }
                }
                // set traffic
                danti.map.setTraffic(traffic);
                // set wind indicator
                if (bands && bands.Wind && danti.wind) {
                    danti.wind.setAngleFrom(bands.Wind.deg);
                    danti.wind.setMagnitude(bands.Wind.knot);
                }

                // provide voice feedback for alerts
                if (enable_sound && danti?.voice) {
                    if (!danti.voice.isSpeaking()) {
                        const guidance: Guidance = danti?.voice?.getGuidance({
                            ownship: flightData.ownship,
                            traffic: flightData.traffic,
                            bands
                        }, { 
                            kind: GuidanceKind['RTCA DO-365'],
                            suppressRepeatedAlerts: true 
                        });
                        if (guidance) {
                            danti.voice.readGuidance({ guidance }); // async call
                        }
                    } else {
                        console.log(`[danti] Skipping guidance (already speaking)`);
                    }
                }
            }
        }
    }
}

/**
 * Returns a unique id
 */
export function uuid (format?: string) {
	let d: number = new Date().getTime();
	format = format || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
	const uuid = format.replace(/[xy]/g, (c: string) => {
		const r: number = ((d + Math.random() * 16) % 16) | 0;
		d = Math.floor(d / 16);
		return (c === 'x' ? r : (r & 0x7 | 0x8)).toString(16);
	});
	return uuid;
}
/**
 * Utility class DantiClient used to communicate with the back-end
 */
export class DantiClient extends DAAClient {
    protected clientId: string;

    /**
     * Returns the websocket connection to the server
     */
    getWebSocket (): WebSocket {
        return this.ws;
    }
    /**
     * Activated the client, i.e., connects the client to the server
     */
    async activate (opt?: { https?: boolean }): Promise<boolean> {
        // const serverUrl: string = opt?.https ? `https://${DANTI_URL}` : `http://${DANTI_URL}`;
        // await this.connectToServer(serverUrl);
        const serverUrl: string = document.location.href.startsWith("file:") ?
            opt?.https ? `https://${DANTI_URL}` : `http://${DANTI_URL}`
                : `${document.location.href.replace("http", "ws")}`;
        await this.connectToServer(serverUrl);
        return this.ws !== null && this.ws !== undefined;
    }
    /**
     * Register the client on a given channel
     */
    async sendRequest (type: DantiRequestType, data?: unknown): Promise<boolean> {
        if (type) {
            const id: string = uuid();
            const req: DantiRequest = data ? { id, type, data } : { id, type };
            return new Promise<boolean>((resolve) => {
                console.log(`[danti-display] Sending ${type} request`);
                this.ws.send(JSON.stringify(req));
                this.ws.onmessage = (evt): void => {
                    console.log("[danti-display] Received new message", evt);
                    try {
                        if (evt) {
                            const ans: DantiResponse = evt?.data ? JSON.parse(evt.data) : null;
                            if (ans?.req?.id === id) {
                                switch (type) {
                                    case "register-danti": {
                                        const res: RegisterResponse = <RegisterResponse> ans.res;
                                        const success: boolean = !!res?.success;
                                        if (success) {
                                            this.clientId = ans.req.id;
                                            console.log(`[danti-display] ${type} request completed successfully!`);
                                            console.log(`[danti-display] Client ID is ${this.clientId}`);
                                        }
                                        resolve(success);
                                        break;
                                    }
                                    // case "render-request": {
                                    //     const res: RenderResponse = <RenderResponse> ans.res;
                                    //     const success: boolean = !!res?.success;
                                    //     if (success) { console.log(`[danti-display] ${type} request completed successfully!`); }
                                    //     resolve(success);
                                    //     break;
                                    // }
                                    // case "flight-plan": {
                                    //     // display flight plan
                                        
                                    //     break;
                                    // }
                                    default: {
                                        console.warn(`unknown request ${type}`, ans);
                                        break;
                                    }
                                }
                            } else {
                                console.warn(`skipping request (id /= ${id})`, ans);
                            }
                        }
                    } catch (error) {
                        console.error("[danti-display] Error: failed to register danti-app", error);
                        resolve(false);
                    }
                }
            });
        }
        return false;
    }
}