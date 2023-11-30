<img src="screenshots/danti-cabin-logo.png" alt="DANTi" width="200"/>

DANTi is an open-source display prototype for exploring the design of assistive detect-and-avoid (DAA) applications in the cockpit. 

> Note: In an effort to track usage and maintain accurate records of the use of  DANTi, each recipient, upon cloning or downloading the software, is requested to provide NASA, by e-mail to Maria Consiglio (maria.c.consiglio@nasa.gov), the following information: First and Last Name; Email Address; and Affiliation. Recipient’s name and personal information shall be used for statistical purposes only.

The display prototype has a split architecture with a back-end server and a front-end. The DANTi back-end can be executed on any operating system that supports [Electron](https://www.electronjs.org/) and [Java OpenJDK](https://openjdk.org/). The DANTi front-end can be executed on the same machine where the DANTi back-end is executed, as well as on remote machines and smart devices (e.g., tablets, smartphones) connected to the same TCP/IP network where the DANTi back-end is executed.

The prototype can be connected to the [X-Plane flight simulator](https://www.x-plane.com/) using the [XPlane SDK](http://www.xsquawkbox.net/xpsdk/docs/DataRefs.html) and the [XPlaneConnect toolkit](https://github.com/nasa/XPlaneConnect). 

<video width="800" controls>
  <source src="screenshots/danti-loop-v2-oshkosh.mp4" type="video/mp4">
</video>

## Documentation
- [DANTi technical report](docs/DANTi-techrep-extended.pdf): this document illustrates the design and implementation of DANTi
- [DANTi handout](docs/DANTi-handout-2022.pdf): leaflet containing information about DANTi
- [DANTi webpage](https://shemesh.larc.nasa.gov/fm/DANTi/): https://shemesh.larc.nasa.gov/fm/DANTi/

## Requirements
- NodeJS (v18.0.0 or greater) https://nodejs.org/en/download
- Java Open JDK (11 or greater) https://openjdk.java.net/install
- XPlaneConnect Toolbox ([v.1.3-RC5](https://github.com/nasa/XPlaneConnect/releases/download/v1.3-rc5/XPlaneConnect.zip), required only when connecting DANTi to X-Plane 11) https://github.com/nasa/XPlaneConnect


## Build Instructions
To compile DANTi from the source code:
1. Open a terminal window and change directory to the `danti` folder
2. Run `make` in the terminal window. This command will download the dependencies and create a folder `dist/` with the DANTi distribution
3. Download [XPlaneConnect Toolbox v.1.3-RC5](https://github.com/nasa/XPlaneConnect/releases/download/v1.3-rc5/XPlaneConnect.zip), decompress the zip file and copy the XPlaneConnect folder to the X-Plane plugins folder ([X-Plane Directory]/Resources/plugins/). See also installation instructions at https://github.com/nasa/XPlaneConnect

> Note: The current version of the compilation scripts work only under MacOS and Linux. Support for compilation on Windows will be added in the near future.


## Launch Instruction
To launch DANTi on a local machine:
1. Open a command prompt at the `danti` folder 
2. Type the following command at the command prompt

```
npm run danti
```

> Note: The above command will start the DANTi back-end server and then automatically open a window with the DANTi front-end.


## Mirroring DANTi on a Tablet
To mirror the DANTi front-end on a tablet or other smart device:
1. Check the address of the local machine where DANTi is running (e.g., using the command `ifconfig`)
2. Make sure the firewall settings on the local machine allows connections on port `8082`
3. On the tablet, open a Web browser and navigate to the following address: `http://<address-of-local-machine>:8082`

> Note: To perform a quick test of the mirroring capabilities of DANTi, open the following link on the local machine where DANTi is executed: http://localhost:8082 The browser window will mirror the content of the DANTi display.


## Connecting DANTi to X-Plane
To connect DANTi to the X-Plane flight simulator:
1. Launch X-Plane
> Note: Make sure you have installed the [X-Plane Connect Toolbox ver 1.3-RC5](https://github.com/nasa/XPlaneConnect/releases/download/v1.3-rc5/XPlaneConnect.zip) in X-Plane, see installation instructions on [github](https://github.com/nasa/XPlaneConnect#quick-start). 
2. Launch DANTi
3. Open a command prompt at the `danti` folder and type the following command to link X-Plane to DANTi.

```
npm run connect-xplane2danti
```
> Note: Keep the terminal open, otherwise the connection will be terminated.

## Playback of Recorded Flight Scenarios
Utility functions are provided to support playback of recorded flight scenarios in `.daa` format:

### Replay in DANTi
To replay flight scenario in DANTi:
1. Open a command prompt at the `danti` folder and type the following command

  ```
  npm run stream-scenario2danti -- Centennial_N416DJ_own_short.daa
  ```
 
> Note: Keep the command prompt open. This command will replay scenario `Centenial_N416DJ_own_short.daa`. Example scenarios are in folder `dist/daa-scenarios` and the replay script uses that folder as base folder when trying to load scenarios indicated at the command line.

### Replay in X-Plane + DANTi
To replay a flight scenario in X-Plane + DANTi:
1. Launch X-Plane, start a new flight, and pause the simulation
> Note: Pausing the simulation is necessary to avoid the X-Plane engine to interfere with the commands we will send to replay the flight scenario
2. Open a command prompt at the `danti` folder and type the following command
  
  ```
  npm run stream-scenario2xplane
  ```

> Note: Keep the command prompt open. This command will replay scenario `Centennial_N416DJ_own_m_short.daa`. The list of available scenarios are in folder `dist/daa-scenarios`. To replay a different scenario, pass the scenario name as a command line argument to the npm script using the `--` separator. For example, the replay `scenario-6.daa`, use the command `npm run stream-scenario2xplane -- scenario-6.daa`


## Notes for Developers
The [docs](./docs/) folder includes useful documentation, including technical reports on the design and architecture of DANTi. Additionally, the DANTi distribution includes a series of convenient npm scripts and bash scripts for launching DANTi, activating the connection with X-Plane, and creating streaming services for sending scenario data to DANTi and/or X-Plane. The npm scripts are stored in `package.json` in section `scripts`.

### DANTi connection examples
- [stream-scenario2danti.ts](./src/danti-connect/stream-scenario2danti.ts): This example demonstrates how to use the `DantiConnection` class to send data and control commands to DANTi using a WebSocket connection.
- [stream-scenario2xplane.ts](./src/danti-connect/stream-scenario2xplane.ts): This example demonstrates how to use the `DantiConnection` class to playback a scenario in X-Plane using a WebSocket connection and XPlane-Connect (XPC) Toolbox. The maximum number of traffic aircraft is 20, this limit is imposed by the XPC Toolbox. The full list of parameters and commands that can be sent to X-Plane with XPC is documented at http://www.xsquawkbox.net/xpsdk/docs/DataRefs.html


### Useful Bash scripts

- [danti.sh](./danti.sh): use this script to launch an instance of the DANTi display.
    - To resize the display, use `Ctrl+`/`Ctrl-` (Linux) and `Command+`/`Command-` (MacOS).
    - An option `frameless` that can be used to render the display without a window frame. When rendered without the window frame, use the resize corners to move the position of the display. 
- [connect-xplane2danti.sh](./connect-xplane2danti.sh): connects a running instance of X-Plane with a running instance of DANTi. This script is to be used during live simulations where a user controls the aircraft with a joystick.
- [stream-scenario2xplane.sh](./stream-scenario2xplane.sh): reads a .daa scenario file and streams the scenario to a running instance of X-Plane. Note that X-Plane should be put in pause, otherwise the physics simulator may override the flight data sent with the script.
    - A `.daa` scenario file can be specified as parameter. All scenarios are in [dist/daa-scenarios](dist/daa-scenarios). The default scenario streamed by the script is `Centennial_N416DJ_own_maneuver.daa`.
    - Mnemonic names can be used to specify a `.daa` scenario: `centennial` corresponds to `Centennial_N416DJ_own_m.daa`, `centennial-accident` corresponds to `Centennial_N416DJ_own_maneuver.daa`, and `centennial-accident-short` corresponds to `Centennial_N416DJ_own_m-short.daa`. These mnemonic names are defined in `config.ts`. 
    - The default interval used for sending scenario data to X-Plane is 1 second. This value can be changed using the option `speed n` where `n` is a multiplier that accelerates/decelerates the playback interval. For example `speed 2` accelerates playback by a factor of 2 (i.e., the interval will be 500ms), `speed 0.5` decelerates playback (the interval will be 2s). Increasing the simulation speed can be used for fast-time simulations. Reducing the speed is useful for running simulations on slower machines that are unable to keep up with rendering.
    - An option `animate` can be used to create a smoother playback. The option automatically introduces additional states in the original .daa file by interpolating the position and heading of the aircraft.
    - Flight data sent to X-Plane can be forwarded automatically to a running instance of DANTi with the `connect-xplane2danti-replay.sh` script.
- [stream-scenario2danti.sh](./stream-scenario2danti.sh): reads a .daa scenario file and streams the scenario directly to the DANTi display. The script supports the same options of `stream-scenario2xplane.sh`. Additionally, an option `loop` can be used to loop the scenario forever.
- [stream-scenario2danti-loop.sh](./stream-scenario2danti-loop.sh): alternative version of `stream-scenario2danti.sh`, loops the scenario forever. Equivalent to `stream-scenario2danti.sh loop`
- [test-xplane-connection.sh](./test-xplane-connection.sh): test script for the connection with X-Plane. The test executed with the script disables the physics engine of X-Plane, moves the location of the ownship and 2 other aircraft to an airport in Seattle, and sets the heading/altitude of the aircraft. The modules for the integration with X-Plane are implemented in Java and build on the XPlaneConnect toolbox. For additional details, see source code at [src/danti-connect/xplane](src/danti-connect/xplane).

## Structure

```
.
├── src
│   ├── danti-app                                // DANTi application
│   │     ├── danti-display.ts                   // Front-end
│   │     ├── danti-server.ts                    // Back-end
│   │     ├── danti-worker.ts                    // Process worker for computing maneuver guidance
│   │     └── danti-interface.ts                 // APIs declaration
│   │
│   ├── danti-utils                              // Utility functions for computing maneuver guidance
│   │     ├── DAABandsREPLV2.java                // Read-Eval-Print loop for computing maneuver guidance in real time
│   │     ├── DAABandsV2.java                    // Core functions for computing maneuver guidance with DAIDALUS
│   │     ├── DAA2Json.java                      // Converts DAIDALUS results into JSON format
│   │     └── DAAMonitorsV1.java                 // Run time monitors
│   │
│   ├── danti-connect                            // Communication function for connecting to DANTi
│   │     ├── danti-connection.ts                // Utility functions for connecting a generic data source to DANTi
│   │     ├── connect-xplane2danti.ts            // Utility functions for connecting X-Plane to DANTi
│   │     ├── flight-plan.ts                     // Utility functions for sending a flight plan to DANTi
│   │     ├── send-config.ts                     // Utility functions for sending a configuration file to DANTi
│   │     ├── stream-scenario2danti.ts           // Utility functions for sending pre-recorded flight data to DANTi
│   │     ├── stream-scenario2xplane.ts          // Utility functions for sending pre-recorded flight data to X-Plane
│   │     └── xplane
│   │           ├── xplane-connection.ts         // Core function for conneting X-Plane to DANTi
│   │           └── src
│   │                 ├── XPlaneConnection.java  // Interface to the XPC ToolBox
│   │                 └── XPC                    // XPC ToolBox (X-Plane Communication Toolbox)
│   ├── daa-displays                             // DAA-Displays widgets library
│   ├── danti-themes                             // Visual styles for the DANTi front-end
│   ├── daa-scenarios                            // Example flight scenarios, useful for DANTi demos
│   ├── filters.ts                               // Configurable traffic filters
│   ├── config.ts                                // DANTi configuration parameters
│   ├── backend.ts                               // Electron back-end
│   ├── frontend.ts                              // Electron front-end
│   ├── main.ts                                  // Electron main app
│   └── index.html                               // Baseline visual style for the DANTi front-end
├── dist                                         // DANTi distribution, generated from `src` using the Makefile 
├── danti.sh                                     // Script for launching DANTi
├── Makefile                                     // Compilation targets
└── package.json                                 // Manifest file and scripts
```

## Notices

### Copyright
Copyright 2023 United States Government as represented by the Administrator of the National Aeronautics and Space Administration. All Rights Reserved..

### Third Party Software:
Third-Party Software: See Appendix_A_LAR-20393-1 (Attached)

### Disclaimers
No Warranty: THE SUBJECT SOFTWARE IS PROVIDED "AS IS" WITHOUT ANY WARRANTY OF ANY KIND, EITHER EXPRESSED, IMPLIED, OR STATUTORY, INCLUDING, BUT NOT LIMITED TO, ANY WARRANTY THAT THE SUBJECT SOFTWARE WILL CONFORM TO SPECIFICATIONS, ANY IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR FREEDOM FROM INFRINGEMENT, ANY WARRANTY THAT THE SUBJECT SOFTWARE WILL BE ERROR FREE, OR ANY WARRANTY THAT DOCUMENTATION, IF PROVIDED, WILL CONFORM TO THE SUBJECT SOFTWARE. THIS AGREEMENT DOES NOT, IN ANY MANNER, CONSTITUTE AN ENDORSEMENT BY GOVERNMENT AGENCY OR ANY PRIOR RECIPIENT OF ANY RESULTS, RESULTING DESIGNS, HARDWARE, SOFTWARE PRODUCTS OR ANY OTHER APPLICATIONS RESULTING FROM USE OF THE SUBJECT SOFTWARE.  FURTHER, GOVERNMENT AGENCY DISCLAIMS ALL WARRANTIES AND LIABILITIES REGARDING THIRD-PARTY SOFTWARE, IF PRESENT IN THE ORIGINAL SOFTWARE, AND DISTRIBUTES IT "AS IS."
 
Waiver and Indemnity:  RECIPIENT AGREES TO WAIVE ANY AND ALL CLAIMS AGAINST THE UNITED STATES GOVERNMENT, ITS CONTRACTORS AND SUBCONTRACTORS, AS WELL AS ANY PRIOR RECIPIENT.  IF RECIPIENT'S USE OF THE SUBJECT SOFTWARE RESULTS IN ANY LIABILITIES, DEMANDS, DAMAGES, EXPENSES OR LOSSES ARISING FROM SUCH USE, INCLUDING ANY DAMAGES FROM PRODUCTS BASED ON, OR RESULTING FROM, RECIPIENT'S USE OF THE SUBJECT SOFTWARE, RECIPIENT SHALL INDEMNIFY AND HOLD HARMLESS THE UNITED STATES GOVERNMENT, ITS CONTRACTORS AND SUBCONTRACTORS, AS WELL AS ANY PRIOR RECIPIENT, TO THE EXTENT PERMITTED BY LAW.  RECIPIENT'S SOLE REMEDY FOR ANY SUCH MATTER SHALL BE THE IMMEDIATE, UNILATERAL TERMINATION OF THIS AGREEMENT.

## Contacts
Maria Consiglio (NASA LaRC) (maria.c.consiglio@nasa.gov)
Paolo Masci (AMA-NASA LaRC) (paolo.masci@ama-inc.com)
Cesar Munoz (NASA LaRC) (cesar.a.munoz@nasa.gov)
