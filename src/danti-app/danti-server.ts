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

import * as ws from 'ws';
import * as express from 'express';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import { AddressInfo } from 'net';
import { LabelsRequest, DantiRequest, RegisterResponse, RenderRequest, TrafficDataRequest, UnitsRequest, OwnshipNameRequest, ConfigRequest, FlightPlanRequest, SetFlightPlanRequest, OwnshipDataRequest } from './danti-interface';
import { DantiData } from './danti-display';
// import * as fs from 'fs';
import { DantiWorker } from './danti-worker';
import * as fsUtils from '../daa-server/utils/fsUtils';
import { DAAScenario, FlightData, ScenarioDataPoint, ScenarioDescriptor } from '../daa-server/utils/daa-types';
import { FlightPlan } from '../daa-displays/daa-utils';
import { DANTI_ADDRESS, DANTI_PORT, ENABLE_PROFILER, TERMINATE_ON_DISCONNECT, USE_PROXIMITY_FILTER, VERBOSE_DBG } from '../config';
import { exit } from 'process';
import { nearby } from './danti-filters';

/**
 * Server backend for danti-app
 */
export class DantiServer {

	/**
	 * Websocket server for exchanging data/commands with danti-app and external modules
	 */
    protected gateway: ws.Server;

	/**
	 * process worker for computing bands
	 */
	protected worker: DantiWorker;

	/**
	 * connected clients
	 */
	protected danti: { wsocket: ws, id: string } [] = [];
	protected virtual_pilot: { wsocket: ws, id: string } [] = [];

	/**
	 * current labels and units
	 */
	protected labels: string;
	protected units: string;

	/**
	 * last received ownship data, useful to keep it to apply filter to traffic
	 */
	protected ownship: OwnshipDataRequest;
	
	/**
	 * Debug flag
	 */
	protected dbg: boolean = true;

	/**
	 * Log messages
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	log (...data: any): void {
		if (this.dbg) {
			console.log(data);
		}
	}

	/**
	 * Activates the server
	 */
	async activate (opt?: { https?: boolean }): Promise<boolean> {
		this.log("[danti-server] Activating danti-server...");
		opt = opt || {};
		const dist_root: string = path.join(__dirname, '../');
		const node_modules: string =  path.join(__dirname, '../node_modules');
		const tile_server: string = path.join(dist_root, 'tile-server');
		const config_folder: string = path.join(dist_root, 'daa-config', '2.x');
		this.log("[danti-server] express", { root: dist_root, tile_server, config_folder });

		// create http service provider
		const app = express();
		app.use(express.static(dist_root));
		app.use(express.static(tile_server));
		console.log(`[danti-server] serving node_modules (${node_modules})`);
		app.use(express.static(node_modules));
		app.get('/WMTSCapabilities.xml', (req, res) => {
			this.log("[danti-server] received request for WMTSCapabilities.xml");
			res.sendFile(path.join(tile_server, 'osm', 'WMTSCapabilities.xml'));
		});
        // additional routing for external libraries
        // app.use(/(\/\w+\/[^\/]+)?\/handlebars\.js/, express.static(path.join(dist_root, `node_modules/handlebars/dist/handlebars.min.js`)));
        // app.use(/(\/\w+\/[^\/]+)?\/jquery\.js/, express.static(path.join(dist_root, `node_modules/jquery/dist/jquery.min.js`)));
        // app.use(/(\/\w+\/[^\/]+)?\/underscore\.js/, express.static(path.join(dist_root, `node_modules/underscore/underscore-min.js`)));
        // app.use(/(\/\w+\/[^\/]+)?\/backbone\.js/, express.static(path.join(dist_root, `node_modules/backbone/backbone.js`)));       
        // app.use(/(\/\w+\/[^\/]+)?\/bootstrap\.bundle\.js/, express.static(path.join(dist_root, `node_modules/bootstrap/dist/js/bootstrap.bundle.min.js`)));
        // app.use(/(\/\w+\/[^\/]+)?\/leaflet\.js/, express.static(path.join(dist_root, `node_modules/leaflet/dist/leaflet.js`)));
		// app.get('/leaflet.js', (req, res) => {
		// 	this.log("[danti-server] received request for leaflet.js");
		// 	res.sendFile(path.join(dist_root, `node_modules/leaflet/dist/leaflet.js`));
		// });


		// create http server
		const options: https.ServerOptions = opt.https ? {
			key: await fsUtils.readFile(path.join(dist_root, 'server.key')),
			cert: await fsUtils.readFile(path.join(dist_root, 'server.crt'))
		} : null;
		const server: http.Server | https.Server = opt.https ? 
			https.createServer(options, app)
				: http.createServer(app);
		server.listen(+DANTI_PORT, DANTI_ADDRESS, () => {
			const address: string = (<AddressInfo> server.address()).address;
			const port: number = (<AddressInfo> server.address()).port;
			const url: string = `${opt.https ? "https://" : "http://"}${address}:${port}`;
			console.info(`[danti-server] danti-server ready at ${url}`);
		});
		// add support for websocket connections
		this.gateway = new ws.Server({
			server
		});
		// handle messages received from client
		this.gateway.on('connection', (wsocket: ws) => {
			console.info('[danti-server] data source connected to gateway');
			wsocket.on('message', (msg: string) => {
				this.onMessageReceived(msg, wsocket);
			});
			wsocket.on('close', () => {
				this.log('[danti-server] data source connection closed');
				// quit
				if (TERMINATE_ON_DISCONNECT) {
					exit(0);
				}
			});
			wsocket.on('error', (err: Error) => {
				this.log('[danti-server] Error in gateway connection', err);
			});
		});
		this.gateway.on('error', (err: Error) => {
			console.error('[danti-server] Error in server', err);
		});
		// create bands process worker
		this.log("[danti-server] Creating bands worker...");
		this.worker = new DantiWorker();
		const success: boolean = await this.worker.activate({ verbose: true });
		this.log(success);
		// set daa config folder
		await this.worker.configFolder(config_folder);
		this.log("[danti-server] Done! ", success);
		return success;
	}
	/**
	 * Gets scenario datapoint
	 */
	getFirstDataPoint (scenario: ScenarioDescriptor): ScenarioDataPoint {
		const res: ScenarioDataPoint = {
			Wind: { deg: "0", knot: "0" },
			Ownship: null,
			Alerts: null,
			"Altitude Bands": null,
			"Heading Bands": null,
			"Horizontal Speed Bands": null,
			"Vertical Speed Bands": null,
			"Altitude Resolution": null,
			"Horizontal Direction Resolution": null,
			"Horizontal Speed Resolution": null,
			"Vertical Speed Resolution": null,
			"Contours": null,
			"Hazard Zones": null,
			Monitors: null,
			Metrics: null,
			WindVectors: null
		};
		if (scenario) {
			for (const key in res) {
				switch (key) {
					case "Monitors": {
						// res[key] = scenario[key];
						break;
					}
					case "Wind": {
						res[key] = scenario[key];
						break
					}
					default: {
						if (scenario[key]?.length) {
							res[key] = scenario[key][0];
						}
					}
				}
			}
		}
		return res;
	}
	/**
	 * Handles messages received on the websocket connection.
	 * Message types are:
	 * - "register-danti": registers danti-display
	 * - "register-virtual-pilot": registers a virtual pilot
	 * - "render-request": forwards daa data to danti-display and virtual-pilot
	 * - "traffic": forwards a traffic state update to danti-worker
	 * - "ownship": forwards a ownship state update to danti-worker
	 * - "labels": forwards labels to danti-worker
	 * - "units": forwards units to danti-worker
	 * - "epoch-end": sync event that triggers the computation of bands in danti-worker
	 */
	async onMessageReceived (msg: string, wsocket: ws): Promise<void> {
		try {
			if (msg) {
				const req: DantiRequest = JSON.parse(msg);
				if (req?.type) {
					// this.log(`[danti-server] Received ${req.type} request (msg-id=${req.id})`);
					switch (req.type) {
						case "reset": {
							await this.worker.reset();
							break;
						}
						case "register-danti": {
							this.danti.push({ wsocket, id: req.id });
							console.log(`** registered danti-display ${req.id}`);
							const res: RegisterResponse = { success: true };
							await new Promise((resolve) => {
								wsocket.send(JSON.stringify({ req, res }), (err?: Error) => {
									resolve(!err);
								});
							});
							break;
						}
						case "register-virtual-pilot": {
							this.virtual_pilot.push({ wsocket, id: req.id });
							console.log(`** registered virtual-pilot ${req.id}`);
							const res: RegisterResponse = { success: true };
							await new Promise((resolve) => {
								wsocket.send(JSON.stringify({ req, res }), (err?: Error) => {
									resolve(!err);
								});
							});
							break;
						}
						case "render-request": {
							// forward render request to all registered danti apps
							const data: DantiData = (<RenderRequest> req).data;
							if (data) {
								let success: boolean = true;
								for (let i = 0; i < this.danti.length; i++) {
									success = success && await new Promise((resolve) => {
										this.danti[i].wsocket?.send(JSON.stringify(data), (err?: Error) => {
											resolve(!err);
										});
									});
								}
								for (let i = 0; i < this.virtual_pilot.length; i++) {
									success = success && await new Promise((resolve) => {
										this.virtual_pilot[i].wsocket?.send(JSON.stringify(data), (err?: Error) => {
											resolve(!err);
										});
									});
								}
							}
							break;
						}
						case "traffic": {
							// send traffic update to worker
							const data: string = (<TrafficDataRequest> req).data;
							if (data) {
								const isNearby: boolean = USE_PROXIMITY_FILTER ? nearby(this.ownship, <TrafficDataRequest> req, this.labels, this.units) : true;
								if (isNearby) {
									await this.worker.trafficData(data);
								}
							}
							break;
						}
						case "ownship": {
							// send ownship data to worker
							const data: string = (<OwnshipDataRequest> req).data;
							if (data) {
								this.ownship = <OwnshipDataRequest> req;
								await this.worker.ownshipData(data);
							}
							break;
						}
						case "ownship-name": {
							// send ownship name to worker
							const data: string = (<OwnshipNameRequest> req).data;
							if (data) {
								await this.worker.ownshipName(data);
							}
							break;							
						}
						case "labels": {
							// send labels to worker
							const data: string = (<LabelsRequest> req).data;
							if (data) {
								this.labels = data;
								await this.worker.labels(data);
							}
							break;
						}
						case "units": {
							// send labels to worker
							const data: string = (<UnitsRequest> req).data;
							if (data) {
								this.units = data;
								await this.worker.units(data);
							}
							break;
						}
						case "config": {
							// send config to worker
							const data: string = (<ConfigRequest> req).data;
							if (data) {
								await this.worker.config(data);
							}
							break;
						}
						case "flight-plan": {
							// forward flight plan to danti-display
							const lines: string[] = (<FlightPlanRequest> req).data?.split("\n") || [];
							console.log("Received flight plan", lines);
							const flightPlan: FlightPlan = lines.filter(line => {
								// each line is in the form label, lat, lon, alt
								return line?.split(',')?.length === 4;
							}).map(line => {
								// each line is in the form label, lat, lon, alt
								const elems: string[] = line.split(',');
								return {
									label: elems[0], 
									lla: { lat: +elems[1], lon: +elems[2], alt: +elems[3] }
								};
							});
							for (let i = 0; i < this.danti?.length; i++) {
								const req: SetFlightPlanRequest = {
									id: this.danti[i].id,
									type: "flight-plan",
									data: flightPlan
								};
								this.log("[danti-server] Sending flight plan to danti-display", flightPlan, { danti: this.danti[i].id });
								this.danti[i].wsocket?.send(JSON.stringify(req));
							}
							break;
						}
						case "epoch-end": {
							// send compute-bands request to worker
							// profile data
							const startTime_worker: number = Date.now();
							const data: { bands: string, lla: string } = await this.worker.computeBands();
							const endTime_worker: number = Date.now();
							if (data) {
								try {
									const startTime_decodeResults: number = Date.now();
									const desc: ScenarioDescriptor = JSON.parse(data.bands);
									const bands: ScenarioDataPoint = this.getFirstDataPoint(desc);
									const scenario: DAAScenario = JSON.parse(data.lla);
									const flightData: FlightData = scenario.lla[scenario.steps[0]];
									const dantiData: DantiData = {
										flightData, 
										bands
									};
									const endTime_decodeResults: number = Date.now();
									if (VERBOSE_DBG) { this.log("[danti-server] Sending data to danti-display", dantiData); }
									const startTime_sendBands: number = Date.now();
									for (let i = 0; i < this.danti?.length; i++) {
										console.log(`** Sending data to danti-display #${this.danti[i].id}`);
										const req: RenderRequest = {
											id: this.danti[i].id,
											type: "render-request",
											data: dantiData
										};
										this.danti[i].wsocket?.send(JSON.stringify(req));
									}
									const endTime_sendBands: number = Date.now();
									if (ENABLE_PROFILER) {
										this.log("[danti-server] PROFILER", `compute: ${endTime_worker - startTime_worker}ms`);
										this.log("[danti-server] PROFILER", `decode: ${endTime_decodeResults - startTime_decodeResults}ms`);
										this.log("[danti-server] PROFILER", `send: ${endTime_sendBands - startTime_sendBands}ms`);
									}
								} catch (error) {
									this.log(`[danti-server] Error while parsing REPL.json`, error);
								}
							}
							break;
						}
						default: {
							this.log(`[danti-server] Warning: unhandled request type ${req.type}`, req);
							break;
						}
					}
				} else {
					this.log(`[danti-server] Warning: malformed request (type is missing)`, req);
				}
			}
		} catch (error) {
			this.log("[danti-server] Error while parsing message", msg, error);
		}
	}
}