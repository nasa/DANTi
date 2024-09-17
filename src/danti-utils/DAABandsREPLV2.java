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

import java.io.IOException;
import java.io.PrintWriter;
import java.io.StringReader;
import java.net.Socket;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Hashtable;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Scanner;
import java.util.Set;

import gov.nasa.larcfm.ACCoRD.Daidalus;
import gov.nasa.larcfm.ACCoRD.TrafficState;
import gov.nasa.larcfm.IO.SeparatedInput; // FIXME: this class is declared 'final' and cannot be extended
import gov.nasa.larcfm.IO.StateReader;
import gov.nasa.larcfm.Util.AircraftState;
import gov.nasa.larcfm.Util.Constants;
import gov.nasa.larcfm.Util.LatLonAlt;
import gov.nasa.larcfm.Util.ParameterData;
import gov.nasa.larcfm.Util.Position;
import gov.nasa.larcfm.Util.Projection;
import gov.nasa.larcfm.Util.Triple;
import gov.nasa.larcfm.Util.Vect3;
import gov.nasa.larcfm.Util.Velocity;
import gov.nasa.larcfm.Util.f;


/**
 * Reader class for daa input data
 * TODO: improve gov.nasa.larcfm.IO.SequenceReader so the class can be properly extended (e.g., use 'protected' instead of 'private' methods/fields)
 */
class DaaStreamReader extends StateReader {

	// whether dbg messages are printed
	protected boolean dbg_enabled = true;
	
	// ownship name (if null, then the first traffic aircraft is considered the ownship
	protected String ownshipName;
	// ownship data
	protected Triple<Double, Position, Velocity> ownshipData;
	// traffic data
	protected Map<String, Triple<Double, Position, Velocity>> trafficData = new Hashtable<String, Triple<Double, Position, Velocity>>();
	// extra columns of the daa file
	protected HashMap<Triple<Double,String,Integer>,Triple<Double,Boolean,String>> allExtracolumnValues = new HashMap<Triple<Double,String,Integer>,Triple<Double,Boolean,String>>(); // ac num & column -> value

	/**
	 * Constructors
	 */
	DaaStreamReader () { }
	DaaStreamReader (String daaData) { readData(daaData); }

	/**
	 * Sets the ownship name
	 */
	boolean setOwnshipName (String name) {
		if (name != null && !name.isEmpty()) {
			ownshipName = name;
			return true;
		}
		return false;
	}
	/**
	 * Utility function, prints debug messages on stderr
	 */
	void log (String msg) {
		if (dbg_enabled) {
			System.err.println("# " + msg);
		}
	}
	/**
	 * Reads given daa data
	 */
	boolean readData (String daaData) {
		log("reading data stream...");

		input = new SeparatedInput(new StringReader(daaData));
		input.setCaseSensitive(false);

		hasRead = false; // whether the heading lines have been read
		clock = true;

		// save accuracy info in temp vars
		double h = Constants.get_horizontal_accuracy();
		double v = Constants.get_vertical_accuracy();
		double t = Constants.get_time_accuracy();

		log("ownship name: " + ownshipName);
		boolean success = true;
		while (!input.readLine()) {
			// read heading lines, if they have not been read yet
			if (!hasRead) { success &= processHeading(); }

			// get aircraft name
			String name = input.getColumnString(head.get(NAME));

			double tm = (head.get(TM_CLK) >= 0) ? 
				parseClockTime(input.getColumnString(head.get(TM_CLK)))
					: 0;

			Position ss = (latlon) ?
				// the values are in the default units.
				Position.make(LatLonAlt.mk(input.getColumn(head.get(LAT_SX), "deg"), 
						input.getColumn(head.get(LON_SY), "deg"), 
						input.getColumn(head.get(ALT_SZ), "ft")))
				: Position.make(new Vect3(
						input.getColumn(head.get(LAT_SX), "nmi"), 
						input.getColumn(head.get(LON_SY), "nmi"), 
						input.getColumn(head.get(ALT_SZ), "ft")));

			Velocity vv = (trkgsvs) ?
				Velocity.mkTrkGsVs(
						input.getColumn(head.get(TRK_VX), "deg"), 
						input.getColumn(head.get(GS_VY), "knot"), 
						input.getColumn(head.get(VS_VZ), "fpm"))
				: Velocity.mkVxyz(
						input.getColumn(head.get(TRK_VX), "knot"), 
						input.getColumn(head.get(GS_VY), "knot"), 
						input.getColumn(head.get(VS_VZ), "fpm"));

			Triple<Double, Position, Velocity> entry = Triple.make(tm, ss, vv);

			// set ownship name if necessary
			if (ownshipName == null || ownshipName.isEmpty()) {
				ownshipName = name;
				log("setting ownship name to " + ownshipName);
			}
			// save ownship / traffic information in the appropriate data structure
			if (ownshipName.equals(name)) {
				log("ownship (time; pos; vel): " + entry.toString());
				ownshipData = entry;
				ownshipName = name;
			} else {
				log("traffic (time; pos; vel): " + entry.toString());
				trafficData.put(name, entry);
			}

			int stateIndex = getIndex(name);
			if (stateIndex < 0) {
				stateIndex = size();
				states.add(new AircraftState(name));
			}
			states.get(stateIndex).add(ss, vv, tm);
		
			// handle extra columns
			for (int i = definedColumns; i < head.size(); i++) {
				int colnum = head.get(i);
				String str = null;
				Double val = null;
				Boolean bol = null;
				if (input.columnHasValue(colnum)) {
					str = input.getColumnString(colnum);
					val = input.getColumn(colnum, Double.NaN, false);
					bol = str.equalsIgnoreCase("true");
					allExtracolumnValues.put(Triple.make(tm, name, colnum), Triple.make(val, bol, str));
				}
			}
		}
		// reset accuracy parameters to their previous values
		Constants.set_horizontal_accuracy(h);
		Constants.set_vertical_accuracy(v);
		Constants.set_time_accuracy(t);

		log("done with reading!");
		return success;
	}
	/**
	 * Internal function, reads the heading lines
	 */
	protected boolean processHeading () {
		// process heading
		latlon = (input.findHeading("lat", "lon", "long", "latitude") >= 0);
		clock = (input.findHeading("clock", "") >= 0);
		trkgsvs = (input.findHeading("trk", "track") >= 0);

		head.set(NAME, input.findHeading("name", "aircraft", "id"));
		head.set(LAT_SX, input.findHeading("sx", "lat", "latitude"));
		head.set(LON_SY, input.findHeading("sy", "lon", "long", "longitude"));
		head.set(ALT_SZ, input.findHeading("sz", "alt", "altitude"));
		head.set(TRK_VX, input.findHeading("trk", "vx", "track"));
		head.set(GS_VY, input.findHeading("gs", "vy", "groundspeed", "groundspd"));
		head.set(VS_VZ, input.findHeading("vs", "vz", "verticalspeed", "hdot"));
		head.set(TM_CLK, input.findHeading("clock", "time", "tm", "st"));

		// set accuracy parameters (don't use UtilParameters due to plan inclusion)
		if (getParametersRef().contains("horizontalAccuracy")) {
			Constants.set_horizontal_accuracy(getParametersRef().getValue("horizontalAccuracy","m"));
		}
		if (getParametersRef().contains("verticalAccuracy")) {
			Constants.set_vertical_accuracy(getParametersRef().getValue("verticalAccuracy","m"));
		}
		if (getParametersRef().contains("timeAccuracy")) {
			Constants.set_time_accuracy(getParametersRef().getValue("timeAccuracy","s"));
		}
		if (getParametersRef().contains("Projection.projectionType")) {
			Projection.setProjectionType(Projection.getProjectionTypeFromString(getParametersRef().getString("Projection.projectionType")));
		}
		if (getParametersRef().contains("filetype")) {
			String sval = getParametersRef().getString("filetype");
			if (!sval.equalsIgnoreCase("state") && !sval.equalsIgnoreCase("history") && !sval.equalsIgnoreCase("sequence")) {
				error.addError("Wrong filetype: "+sval);
				return false;
			}
		}
		// add new user column headings
		for (int i = 0; i < input.size(); i++) {
			String hd = input.getHeading(i);
			if (!hd.equals("")) {
				int headingindex = input.findHeading(hd);
				if (!head.contains(headingindex)) {
					head.add(headingindex);
				}
			}
		}
		// check if the input was well-formed
		for (int i = 0; i <= VS_VZ; i++) {
			if (head.get(i) < 0) {
				error.addError("This appears to be an invalid state file (missing header definitions)");
				hasRead = false;
				return hasRead;
			}
		}
		hasRead = true;
		return hasRead;
	}
	/**
	 * Internal function, removes stale aircraft states.
	 * A state is stale if its timestamp is older than current_time - stale_threshold
	 */
	public void removeStaleData (double stale_threshold) {
		if (ownshipData != null && trafficData.size() > 0 && stale_threshold > 0) {
			int own_index = getIndex(ownshipName);
			log("own index " + own_index);
			if (own_index >= 0) {
				double current_time = getTime(own_index);
				double stale_time = current_time - stale_threshold;
				log("current time " + current_time);
				log("stale threshold " + stale_threshold);
				log("stale time:" + stale_time);
				List<String> stale = new ArrayList<String>();
				if (current_time >= 0) {
					Set<String> keys = trafficData.keySet();
					Iterator<String> it = keys.iterator();
					while (it.hasNext()) {
						String ac_name = it.next();
						int ac_index = getIndex(ac_name);
						double ac_time = getTime(ac_index);
						String msg = "checking aircraft " + ac_name + " (time: " + ac_time +")";
						if (ac_time < stale_time) {
							msg += " -- stale";
							stale.add(ac_name);
							states.remove(ac_index);
						} else {
							msg += " -- ok!";
						}
						log(msg);
					}
					if (stale.size() > 0) {
						for (String ac_name : stale) {
							trafficData.remove(ac_name);
						}
					}
				}
			}
		}
	}
	/**
	 * Return true if the given aircraft has data for the indicated column at the inicated time.
	 */
	public boolean hasExtraColumnData(double time, String acName, String colname) {
		int colnum = input.findHeading(colname); 		
		return allExtracolumnValues.containsKey(Triple.make(time, acName, colnum));
	}	
	/**
	 * Returns the column value associated with a given aircraft at a given time, interpreted as a double, or NaN if there is no info  
	 */
	public double getExtraColumnValue(double time, String acName, String colname) {
		int colnum = input.findHeading(colname); 		
		Triple<Double,Boolean,String> entry = allExtracolumnValues.get(Triple.make(time, acName, colnum));
		if (entry != null && entry.first != null) {
			return entry.first;
		} else {
			return Double.NaN;
		}
	}
	/**
	 * Returns the column value associated with a given aircraft at a given time, interpreted as a boolean, or false if there is no info  
	 */
	public boolean getExtraColumnBool(double time, String acName, String colname) {
		int colnum = input.findHeading(colname); 		
		Triple<Double,Boolean,String> entry = allExtracolumnValues.get(Triple.make(time, acName, colnum));
		if (entry != null && entry.second != null) {
			return entry.second;
		} else {
			return false;
		}
	}
	/**
	 * Returns the column value associated with a given aircraft at a given time, interpreted as a string, or the empty string if there is no info  
	 */
	public String getExtraColumnString(double time, String acName, String colname) {
		int colnum = input.findHeading(colname); 		
		Triple<Double,Boolean,String> entry = allExtracolumnValues.get(Triple.make(time, acName, colnum));
		if (entry != null && entry.third != null) {
			return entry.third;
		} else {
			return "";
		}
	}
	/**
	 * Human-readable representation of DantiReader state
	 */
	public String toString() {
		//return input.toString();
		String ans = "-- DAAStreamReader ------------------------------------------------\n\n";
		for (int j = 0; j < states.size(); j++) {
			ans += states.get(j);
		}
		ans += "\n---------------------------------------------------------------";
		return ans;
	}

}

/**
 * Reader class for daa input data
 * TODO: improve gov.nasa.larcfm.ACCoRD.DaidalusFileWalker so the class can be properly extended (e.g., use 'protected' instead of 'private' methods/fields)
 */
class DantiStreamWalker {
	protected DaaStreamReader streamReader;
	protected ParameterData params;
	protected String ownshipName;
	protected List<String> trafficNames = new ArrayList<String>();
	protected double staleThreshold = 10; // sec
	protected double currentTime = 0;

	/**
	 * Constructors
	 */
	public DantiStreamWalker () { }
	public DantiStreamWalker (String daaData) { walk(daaData); }
	public DantiStreamWalker (String daaData, double threshold) { staleThreshold = threshold; walk(daaData); }

	/**
	 * Set stale threshold
	 */
	boolean setStaleThreshold (double th) {
		if (th >= 0) {
			staleThreshold = th;
			return true;
		}
		return false;
	}

	/**
	 * Walks the entire stream
	 */
	public boolean walk (String daaData) {
		streamReader = new DaaStreamReader();
		if (ownshipName != null && !ownshipName.isEmpty()) {
			streamReader.setOwnshipName(ownshipName);
		}
		if (streamReader.readData(daaData)) {
			params = streamReader.getParameters();
			streamReader.removeStaleData(staleThreshold);
			streamReader.log(streamReader.toString());
			return true;
		}
		return false;
	}

	/**
	 * Sets the ownship name
	 */
	public boolean setOwnshipName(String ownshipName) {
		if (ownshipName != null && !ownshipName.trim().isEmpty()) {
			this.ownshipName = ownshipName;
			streamReader.log("ownship name: " + this.ownshipName);
			return true;
		}
		return false;
	}

	/**
	 * Walks the extra columns
	 */
	protected static ParameterData extraColumnsToParameters(DaaStreamReader sr, double time, String ac_name) {
		ParameterData pd = new ParameterData();
		List<String> columns = sr.getExtraColumnList();
		for (String col : columns) {
			if (sr.hasExtraColumnData(time, ac_name, col)) {
				String units = sr.getExtraColumnUnits(col);
				if (units.equals("unitless") || units.equals("unspecified")) {
					pd.set(col, sr.getExtraColumnString(time, ac_name, col));
				} else {
					pd.setInternal(col, sr.getExtraColumnValue(time, ac_name, col), units);
				}
			}
		}
		return pd;
	}

	public static void readExtraColumns(Daidalus daa, DaaStreamReader sr, int ac_idx) {
		ParameterData pcol = extraColumnsToParameters(sr,daa.getCurrentTime(),daa.getAircraftStateAt(ac_idx).getId());
		if (pcol.size() > 0) {
			daa.setParameterData(pcol);
			if (pcol.contains("alerter")) {
				daa.setAlerterIndex(ac_idx,pcol.getInt("alerter"));
			}
			double s_EW_std = 0.0;
			if (pcol.contains("s_EW_std")) {
				s_EW_std = pcol.getValue("s_EW_std");     	
			}
			double s_NS_std = 0.0;
			if (pcol.contains("s_NS_std")) {
				s_NS_std = pcol.getValue("s_NS_std");     	
			}
			double s_EN_std = 0.0;
			if (pcol.contains("s_EN_std")) {
				s_EN_std = pcol.getValue("s_EN_std");     	
			}
			daa.setHorizontalPositionUncertainty(ac_idx,s_EW_std,s_NS_std,s_EN_std);
			double sz_std = 0.0;
			if (pcol.contains("sz_std")) {
				sz_std = pcol.getValue("sz_std");     	
			}
			daa.setVerticalPositionUncertainty(ac_idx,sz_std);
			double v_EW_std = 0.0;
			if (pcol.contains("v_EW_std")) {
				v_EW_std = pcol.getValue("v_EW_std");     	
			}
			double v_NS_std = 0.0;
			if (pcol.contains("v_NS_std")) {
				v_NS_std = pcol.getValue("v_NS_std");     	
			}
			double v_EN_std = 0.0;
			if (pcol.contains("v_EN_std")) {
				v_EN_std = pcol.getValue("v_EN_std");     	
			}
			daa.setHorizontalVelocityUncertainty(ac_idx,v_EW_std,v_NS_std,v_EN_std);
			double vz_std = 0.0;
			if (pcol.contains("vz_std")) {
				vz_std = pcol.getValue("vz_std");     	
			}
			daa.setVerticalSpeedUncertainty(ac_idx,vz_std);
		}
	}

	/**
	 * Returns the current time
	 */
	double getTime () {
		return currentTime;
	}

	/**
	 * Loads daa data into Daidalus
	 */
	public void readAllStates(Daidalus daa) {
		if (params.size() > 0) {
			daa.setParameterData(params);
			daa.reset();
		}
		int own = 0; // By default onwship is the first aircraft in the list
		String ido = streamReader.getName(own);
		Position so = streamReader.getPosition(own);
		Velocity vo = streamReader.getVelocity(own);
		double to = streamReader.getTime(own);
		daa.setOwnshipState(ido, so, vo, to);
		readExtraColumns(daa, streamReader, own);
		// update current time
		currentTime = daa.getCurrentTime();

		for (int ac = 1; ac < streamReader.size(); ac++) {
			String ida = streamReader.getName(ac);
			if (trafficNames.isEmpty() || trafficNames.contains(ida)) {
				Position sa = streamReader.getPosition(ac);
				Velocity va = streamReader.getVelocity(ac);
				double ta = streamReader.getTime(ac);
				// Notice that idx may be different from ac because of traffic
				int idx = daa.addTrafficState(ida, sa, va, ta); // <<<< added ta
				readExtraColumns(daa,streamReader,idx);
			}
		}
	}
}


/**
 * Creates a read-eval-print loop (REPL) for computing bands with DAIDALUS
 * This code is based on gov.nasa.larcfm.ACCoRD.DaidalusFileWalker
 * FIXME: improve gov.nasa.larcfm.ACCoRD.DaidalusFileWalker so the class can be properly extended (e.g., use 'protected' instead of 'private' methods/fields)
 */
public class DAABandsREPLV2 extends DAABandsV2 {

	// all traffic known to DANTi is shown when VERBOSE_TRAFFIC_LOG = true
	// this is useful for debugging purposes but can affect performance in scenarios with several aircraft
	boolean VERBOSE_TRAFFIC_LOG = false;

	String DEFAULT_LABELS = "name, lat, lon, alt, vx, vy, vz, time";
	String DEFAULT_UNITS = "-, [deg], [deg], [ft], [knot], [knot], [fpm], [s]";
	int TIME_COL = 7; // column with time information

	protected static final String tool_name = "DAABandsREPLV2";
	// protected DAAWebSocketServer server;
	protected Scanner scanner = new Scanner(System.in);

	// possible labels for time
	protected String[] time_labels = { "clock", "time", "tm", "st" };

	// commands with parameters
	static String[] cmd_config_folder = { "config-folder", "configFolder" }; // sets configuration folder (default is <currentFolder>/daa-config/2.x/)
	static String[] cmd_config = { "config", "conf", "c" }; // sets configuration file, e.g., config H1.conf (default is H1.conf)
	static String[] cmd_precision = { "precision", "prec", "p" }; // sets floating point precision, e.g., precision 10 (default is 10)
	static String[] cmd_wind = { "wind", "w" }; // sets wind information, e.g.,  wind { deg: 10, knot: 20 } (default is { deg: 0, knot: 0 })
	static String[] cmd_labels = { "labels", "l" }; // sets the labels of traffic/ownship data, e.g., labels name, lat, lon, alt, vx, vy, vz, time
	static String[] cmd_units = { "units", "u" }; // sets the units of traffic/ownship data, e.g., units -, [deg], [deg], [ft], [knot], [knot], [fpm], [s] 
	static String[] cmd_traffic_data = { "traffic", "traffic-data", "traffic-state" }; // updates traffic information, e.g., traffic LYM970, 34.55753661, -117.00284125, 17000, 0.000000000000073, -600, 0, 0
	static String[] cmd_ownship_data = { "own", "ownship", "ownship-data", "ownship-state" }; // updates ownship information, e.g., ownship N416DJ, 33.8149396, -117, 17000, 0, 200, 0, 0	
	static String[] cmd_ownship_name = { "ownship-name" }; // updates ownship name, e.g., N416DJ (default is "ownship")	
	static String[] cmd_stale_threshold = { "stale", "stale-threshold" };
	static String[] cmd_reset = { "reset" }; // clears aircraft info stored in memory
	static String[] cmd_daa_server = { "daa-server" }; // sets the daa server address/port (default is localhost:9092)

	// commands without parameters
	static String[] cmd_quit = { "quit", "exit", "quit;", "exit;", "bye!" };
	static String[] cmd_version = { "version", "version;" };
	static String[] cmd_show_table = { "show-table", "show-table;" };
	static String[] cmd_compute_bands = { "compute-bands", "compute-bands;", "bands", "bands;", "get-bands", "get-bands;" };
	static String[] cmd_compute_lla = { "compute-lla", "compute-lla;", "lla", "lla;", "get-lla", "get-lla;" };

	// ownship name
	protected String ownshipName = "ownship";
	// ownship data
	protected String ownship;
	// traffic data, aircraft ID is used as key in the hashmap
	protected HashMap<String, String> traffic = new HashMap<String, String>();

	// default labels of a daa file
	protected String labels = DEFAULT_LABELS;
	// units of the default labels
	protected String units = DEFAULT_UNITS;	
	// column with time information
	protected int time_col = TIME_COL;

	// whether the configuration has been loaded
	protected boolean configLoaded = false;
	
	// current working folder
	protected String currentFolder = Paths.get("").toAbsolutePath().toString();
	// config folder
	protected String configFolder = Paths.get(currentFolder + "/daa-config/2.x/").toAbsolutePath().toString();

	// os tmp folder, scenario and output folders
	protected String tmpFolder = System.getProperty("java.io.tmpdir");
	protected String outputFolder = Paths.get(tmpFolder).toAbsolutePath().toString();
	protected String scenarioFolder = Paths.get(tmpFolder).toAbsolutePath().toString();

	// daa config file
	protected String daaConfigFile = "DANTi_SL3.conf"; // DWC_SL3 300ft x 0.3nmi

	// stale threshold: entries older than (current_time - staleness_threshold) are not used in computations
	protected double staleThreshold = 10;

	// daa socket server address port, used to communicate bands to DANTi
	protected String serverAddress = "localhost";
	protected int serverPort = 8083;
	protected Socket clientSocket = null;
	protected PrintWriter socket_out = null;
	
	// daa data stream walker
	protected DantiStreamWalker walker;

	/**
	 * Constructor
	 */
	DAABandsREPLV2 () {
		daaConfig = Paths.get(configFolder + "/" + daaConfigFile).toAbsolutePath().toString(); 
		// ifname = "<REPL>";
		// ofname = Paths.get(outputFolder + "/REPL.json").toAbsolutePath().toString();
		scenario = "<REPL>";
		// sfname = Paths.get(scenarioFolder + "/REPL-scenario.json").toAbsolutePath().toString();
		// daaAlerter = "DWC_Phase_II"; // DWC Terminal 450ft x 1500ft 
		// disabling printing metrics and polys will improve performance
		PRINT_METRICS = false;
		PRINT_POLYGONS = false;
	}

	/**
	 * Utility function, activates the socket connection
	 */
	boolean connect () {
		return connect(serverPort);
	}
	boolean connect (int port) {
		try {
			// create server
			System.out.println("[DAABandsREPLV2] Creating socket connection with DAA Server on localhost:" + serverPort);
			clientSocket = new Socket(serverAddress, serverPort);
			// create output stream for sending data to danti-worker
			System.out.println("[DAABandsREPLV2] Setting up output stream to DAA Server...");
			socket_out = new PrintWriter(clientSocket.getOutputStream(), true);
		} catch (IOException e) {
			System.out.println("[DAABandsREPLV2] Socket connection error :/");
			System.out.println(e);
			return false;
		}
		System.out.println("[DAABandsREPLV2] Socket connection ready!");
		return true;
	}

	/**
	 * Resets ownship, ownshipID, and traffic information, keeps labels and units
	 */
	void reset () {
		ownship = null;
		ownshipName = "ownship";
		traffic = new HashMap<String, String>();
		this.log("resetting ownship and traffic information");
	}

	/**
	 * Utility functions for setting config folder
	 */
	void setConfigFolder (String folder) {
		configFolder = Paths.get(folder).toAbsolutePath().toString();
		daaConfig = Paths.get(configFolder + "/" + daaConfigFile).toAbsolutePath().toString();
		this.log("Setting config folder: " + configFolder);
	}
	/**
	 * Utility functions for setting config file
	 */
	void setConfigFile (String file) {
		daaConfigFile = file;
		daaConfig = Paths.get(configFolder + "/" + daaConfigFile).toAbsolutePath().toString();
		this.log("Setting config folder: " + configFolder);
	}
	/**
	 * Utility functions for setting stale threshold for traffic
	 */
	boolean setStaleThreshold (double th) {
		if (th >= 0) {
			staleThreshold = th;
			this.log("Setting stale threshold: " + staleThreshold);
			return true;
		}
		return false;
	}
	/**
	 * Utility functions for setting DAA server address and port
	 */
	boolean setServerAddressPort (String address_port) {
		String[] info = address_port.split(":");
		if (info != null && info.length > 1) {
			serverAddress = info[0];
			serverPort = Integer.parseInt(info[1]);
			this.log("DAA Server: " + serverAddress + ":" + serverPort);
			return true;
		}
		this.log("Warning: unable to set server address/port at " + address_port);
		return false;
	}

	/**
	 * Utility function, prints the current settings
	 */
	void printSettings () {
		this.log("--- Settings ---");
		this.log(" current folder: " + currentFolder);
		this.log(" config folder: " + configFolder);
		this.log(" config file: " + daaConfigFile);
		if (daaAlerter != null ) { this.log(" selected alerter: " + daaAlerter); }
		this.log(" DAA server: " + serverAddress + ":" + serverPort);
		this.log("----------------");
		this.log(printConfig());
		this.log("----------------");
	}

	/**
	 * Returns true if the command line is a command
	 */
	protected boolean isCommand (String[] cmd, String line) {
		if (line != null) {
			String ln = line.trim();
			for (int i = 0; i < cmd.length; i++) {
				if (ln.startsWith(cmd[i] + " ")) {
					return true;
				}
			}
		}
		return false;
	}
	/**
	 * Returns true if the command line is a meta command
	 */
	protected boolean isMetaCommand (String[] cmd, String line) {
		if (line != null) {
			String ln = line.trim();
			for (int i = 0; i < cmd.length; i++) {
				if (ln.equals(cmd[i])) {
					return true;
				}
			}
		}
		return false;
	}
	/**
	 * Returns the 0-based index of the 'time' colum in the provided line, -1 if the column is not present
	 */
	protected int indexOfTime (String line) {
		if (line != null) {
			String[] cols = line.split(",");
			for (int l = 0; l < time_labels.length; l++) {
				for (int c = 0; c < cols.length; c++) {
					if (cols[c].trim().equalsIgnoreCase(time_labels[l].trim())) {
						return c;
					}
				}
				
			}
		}
		return -1;
	}
	/**
	 * Returns the arguments of the command
	 */
	protected String getArgs (String[] cmd, String line) {
		if (line != null && cmd != null && cmd.length > 0) {
			line = line.trim();
			for (int i = 0; i < cmd.length; i++) {
				if (line.startsWith(cmd[i] + " ")) {
					return line.substring((cmd[i] + " ").length()).trim();
				}
			}
		}
		return null;
	}	
	
	@Override
	public boolean inputFileReadable() {
		return true;
	}
	@Override
	public boolean loadConfig () {
		configLoaded = super.loadConfig();
		return configLoaded;
	}
	/**
	 * Computes daa bands
	 */
	boolean compute_bands () {
		log("Computing bands...");
		// load config
		if (!configLoaded) {
			loadConfig();
		}
		// load wind
		loadWind();
		// create file walker
		walker = new DantiStreamWalker(toDAA(), staleThreshold);
		// set ownship name
		walker.setOwnshipName(ownshipName);
		// walk data
		String bands = compute_bands(walker);
		// log(bands);
		boolean success = sendBands(bands);
		// success &= compute_lla(walker);
		log("Done! " + success);
		return success;
	}
	/**
	 * Computes LLA data
	 */
	boolean compute_lla () {
		log("Computing LLA...");
		// load config
		if (!configLoaded) {
			loadConfig();
		}
		// load wind
		loadWind();
		// create file walker
		walker = new DantiStreamWalker(toDAA(), staleThreshold);
		// set ownship name
		walker.setOwnshipName(ownshipName);
		String lla = compute_lla(walker);
		boolean success = sendLLA(lla);
		log("Done! " + success);
		return success;
	}

	/**
	 * Utility function, sends bands over the socket connection
	 */
	boolean sendBands (String bands) {
		String msg = "{ \"type\": \"bands\", \"val\": " + bands + " }";
		return send(msg);
	}
	/**
	 * Utility function, sends lla data over the socket connection
	 */
	boolean sendLLA (String lla) {
		String msg = "{ \"type\": \"lla\", \"val\": " + lla + " }";
		return send(msg);
	}
	/**
	 * Utility function, sends a string representation of JSON data over the socket connection
	 */
	boolean send (String jsonData) {
		if (socket_out != null) {
			socket_out.println(jsonData);
			return true;
		}
		return false;
	}

	/**
	 * Utility function, prints a list in output as a JSON array.
	 * This version returns a string encoding of the array
	 */
	public static String printArray(List<String> info, String label) {
		String out = "\"" + label + "\": [\n";
		boolean comma = false;
		for (String str : info) {
			if (comma) {
				out += ",\n";
			} else {
				comma = true;
			}
			out += str + "\n";
		}
		out += "]";
		return out;
	}

	/**
	 * Utility function, computes the bands and returns them as a JSON string
	 */
	public String compute_bands (DantiStreamWalker walker) {
		String out = "{\n" + jsonHeader() + "\n";

		walker.readAllStates(daa);
		if (daaAlerter != null) { loadSelectedAlerter(); }
		JsonBands jb = new JsonBands();
		String jsonStats = jsonBands(jb);
		out += jsonStats + ",\n";

		out += printArray(jb.ownshipArray, "Ownship");
		out += ",\n";
		out += printArray(jb.alertsArray, "Alerts");
		out += ",\n";
		out += printArray(jb.metricsArray, "Metrics");
		out += ",\n";
		out += printArray(jb.trkArray, "Heading Bands");
		out += ",\n";
		out += printArray(jb.gsArray, "Horizontal Speed Bands");
		out += ",\n";
		out += printArray(jb.vsArray, "Vertical Speed Bands");
		out += ",\n";
		out += printArray(jb.altArray, "Altitude Bands");
		out += ",\n";
		out += printArray(jb.resTrkArray, "Horizontal Direction Resolution");
		out += ",\n";
		out += printArray(jb.resGsArray, "Horizontal Speed Resolution");
		out += ",";
		out += printArray(jb.resVsArray, "Vertical Speed Resolution");
		out += ",\n";
		out += printArray(jb.resAltArray, "Altitude Resolution");
		out += ",\n";

		out += printArray(jb.contoursArray, "Contours");
		out += ",\n";
		out += printArray(jb.hazardZonesArray, "Hazard Zones");
		out += ",\n";

		out += "\"Monitors\": []\n";
		out += "}";

		return out;
	}

	/**
	 * Computes LLA position
	 */
	protected String compute_lla (DantiStreamWalker walker) {
		log("Computing lla...");
		// re-use the logic of daa2json
		DAA2Json daa2json = new DAA2Json(daa);
		String llaString = "\t\"lla\": {\n"; // position array, grouped by aircraft type
		String daaString = "\t\"daa\": [\n"; // position array, as in the original daa file
		String stepsString = "\t\"steps\": [ "; // time array

		double time = walker.getTime();
		stepsString += "\"" + f.FmPrecision(time, precision16) + "\""; // time at step i in seconds
		llaString += "\t\t\"" + f.FmPrecision(time, precision16) + "\": {\n"; // time at step i
		// print ownship state
		TrafficState ownship = daa.getOwnshipState();
		llaString += "\t\t\t\"ownship\": " + daa2json.printLLA(ownship, ownship) + ",\n";
		llaString += "\t\t\t\"traffic\": [\n";
		// print traffic state
		int nTraffic = 0;
		for (int idx = 0; idx <= daa.lastTrafficIndex(); idx++) {
			TrafficState traffic = daa.getAircraftStateAt(idx);
			daaString += "\t\t" + daa2json.printDAA(ownship, traffic, time);
			if (idx < daa.lastTrafficIndex()) {
				daaString += ",\n";
			}
			if (traffic.getId() != ownship.getId()) {
				nTraffic++;
				llaString += "\t\t\t\t" + daa2json.printLLA(ownship, traffic);
				if (nTraffic < daa.lastTrafficIndex()) {
					llaString += ",\n";
				}
			}
		}
		llaString += "\n\t\t\t]\n\t\t}";
		llaString += "\n\t";
		stepsString += "]";

		String out = "{\n\t\"scenarioName\": \"" + scenario + "\",\n";
		out += "\t\"length\": " + 1 + ", \n";
		out += daaString + "],\n";
		out += llaString + "},\n";
		out += stepsString + "\n";
		out += "}";
		return out;
	}
	
	/**
	 * Logs a debug message
	 */
	void log (String msg) {
		if (msg != null) {
			System.err.println("# " + msg);
		}
	}
	/**
	 * Executes the command line. Returns true if the command has been executed successfully.
	 */
	boolean execCommandLine (String line) {
		if (isMetaCommand(cmd_reset, line)) {
			// clear all data structures
			reset();
			return true;
		}
		if (isMetaCommand(cmd_version, line)) {
			// print version
			log(getVersion());
			return true;
		}
		if (isMetaCommand(cmd_show_table, line)) {
			// print table
			log(toDAA());
			return true;
		}
		if (isCommand(cmd_config_folder, line)) {
			setConfigFolder(getArgs(cmd_config_folder, line));
			return true;
		}
		if (isCommand(cmd_stale_threshold, line)) {
			double val = Double.parseDouble(getArgs(cmd_stale_threshold, line));
			if (Double.isFinite(val)) {
				setStaleThreshold(val);
				if (walker != null) { walker.setStaleThreshold(val); }
				return true;
			}
			return false;
		}
		if (isCommand(cmd_config, line)) {
			// update daa config
			daaConfig = getArgs(cmd_config, line);
			log("loading config file " + daaConfig);
			return true;
		}
		if (isCommand(cmd_precision, line)) {
			// update precision
			String prec = getArgs(cmd_precision, line);
			precision = Integer.parseInt(prec);
			log("precision " + precision);
			return true;
		}
		if (isCommand(cmd_wind, line)) {
			// update wind
			double deg = 0;
			double knot = 0;
			String wnd = getArgs(cmd_wind, line);
			java.util.regex.Matcher match_deg = java.util.regex.Pattern.compile("\\bdeg\\s*:\\s*(\\d+(?:.\\d+)?)").matcher(wnd);
			if (match_deg.find()) {
				deg = Double.parseDouble(match_deg.group(1));
			}
			java.util.regex.Matcher match_knot = java.util.regex.Pattern.compile("\\bknot\\s*:\\s*(\\d+(?:.\\d+)?)").matcher(wnd);
			if (match_knot.find()) {
				knot = Double.parseDouble(match_knot.group(1));
			}	
			wind = "{ deg: " + deg + ", knot: " + knot + " }";
			log("wind " + wind);
			return true;
		}
		if (isCommand(cmd_labels, line)) {
			// update labels
			String data = getArgs(cmd_labels, line);
			if (data != null && data != "") {
				// update labels
				labels = data;
				// update time col
				time_col = indexOfTime(labels);
				log(toDAA());
				return true;
			}
		}
		if (isCommand(cmd_units, line)) {
			// update units
			String data = getArgs(cmd_units, line);
			if (data != null && data != "") {
				// update units
				units = data;
				log(toDAA());
				return true;
			}
		}
		if (isCommand(cmd_ownship_data, line)) {
			// update ownship information
			ownship = getArgs(cmd_ownship_data, line);
			// log(line);
			if (VERBOSE_TRAFFIC_LOG) { log(toDAA()); }
			return true;
		}
		if (isCommand(cmd_ownship_name, line)) {
			// update ownship information
			String name = getArgs(cmd_ownship_name, line);
			if (name != null && !name.trim().isEmpty()) {
				ownshipName = name;
				// log(line);
				if (VERBOSE_TRAFFIC_LOG) { log(toDAA()); }
				return true;
			}
			return false;
		}
		if (isCommand(cmd_traffic_data, line)) {
			// update traffic information
			String data = getArgs(cmd_traffic_data, line);
			if (data != null) {
				// log(line);
				String[] info = data.split(",");
				if (info.length > 0) {
					String id = info[0];
					traffic.put(id, data);
					if (VERBOSE_TRAFFIC_LOG) { log(toDAA()); }
					return true;
				}
			}
			return false;
		}
		if (isMetaCommand(cmd_compute_bands, line)) {
			// compute bands
			return compute_bands();
		}
		if (isMetaCommand(cmd_compute_lla, line)) {
			// compute bands
			return compute_lla();
		}
		if (isCommand(cmd_daa_server, line)) {
			// change daa server
			String data = getArgs(cmd_traffic_data, line);
			if (data != null) {
				try {
					int port = Integer.parseInt(data);
					if (port != serverPort || clientSocket == null || socket_out == null) {
						return connect(port);
					}
				} catch (NumberFormatException nfe) {
					System.out.println(nfe);
					return false;
				}
			}
		}
		log("Error: Unrecognized command '" + line + "'");
		return false;
	}
	/**
	 * Prints ownship and traffic information in daa format
	 */
	String toDAA () {
		String out = "\n" + labels + "\n" + units + "\n";
		if (ownship != null && ownship != "") {
			out += ownship + "\n";
		}
		Iterator<Map.Entry<String, String>> it = traffic.entrySet().iterator();
		while (it.hasNext()) {
			String data = it.next().getValue();
			out += data + "\n";
		}
		return out;
	}
	/**
     * Starts repl
     */
    void start () {
        try {
            while (true) {
				System.out.print(" >> ");
                String line = scanner.nextLine();
                // System.out.printf("input: %s%n", line);
				if (isMetaCommand(cmd_quit, line)) {
					log("closing repl...");
					scanner.close();
					break;
				}
				// else
				log("executing " + line);
				execCommandLine(line);
            }
        } catch (IllegalStateException | NoSuchElementException ex) {
            // System.err.println("bye!");
        } finally {
			log("bye!");
		}
    }
	/**
	 * Returns true if the command line is a command
	 */
	protected boolean isCliArg (String[] cmd, String line) {
		if (line != null) {
			String ln = line.trim();
			for (int i = 0; i < cmd.length; i++) {
				if (ln.equalsIgnoreCase(cmd[i])) {
					return true;
				}
			}
		}
		return false;
	}
	/**
	 * @Override
	 * Parse command line arguments
	 */
	public DAABandsREPLV2 parseCliArgs (String[] args) {
		if (args != null && args.length > 0) {
			log("[DAABandsREPLV2] Parsing CLI args...");
			for (int a = 0; a < args.length; a++) {
				log("args[" + a + "] = " + args[a]);
				if (isCliArg(cmd_config, args[a])) {
					if (a + 1 < args.length) { setConfigFile(args[++a]); }
				} else if (isCliArg(cmd_config_folder, args[a])) {
					if (a + 1 < args.length) { setConfigFolder(args[++a]); }
				} else if (isCliArg(cmd_daa_server, args[a])) {
					if (a + 1 < args.length) { setServerAddressPort(args[++a]); }
				}
			}
		}
		return this;
	}
	/**
	 * @override
	 * Prints the help message
	 */
	public void printHelpMsg() {
		log("-- " + tool_name + " --");
		log("Version: DAIDALUS " + getVersion());
		log("  Creates a read-eval-print loop for computing daa bands");
		log("REPL Commands:");
		log("  version\n\tPrint DAIDALUS version");
		log("  daa-server <port>\n\tSets the DAA Server Port (default: 9092)");
		log("  configFolder <absolute-path-to-config-folder>\n\tSets the config folder");
		log("  config <file.conf>\n\tSets the configuration file to be loaded <file.conf>");
		log("  precision <n>\n\tSets the precision of output values");
		log("  wind <wind_info>\n\tSets wind vector information, a JSON object enclosed in double quotes \"{ deg: d, knot: m }\", where d and m are reals");
		log("  ownship <ownship-data>\n\twhere data is in daa format");
		log("  traffic <traffic-aircraft-data>\n\twhere data is in daa format");
		System.exit(0);
	}

	/**
	 * main entry point
	 */
	public static void main(String[] args) {
		DAABandsREPLV2 repl = new DAABandsREPLV2();
		repl.parseCliArgs(args);
		repl.loadConfig();
		repl.printSettings();
		repl.connect();
		repl.start();
		//repl.printHelpMsg();
	}
}
