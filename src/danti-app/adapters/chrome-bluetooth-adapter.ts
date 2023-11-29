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

// interface definitions based on https://developer.mozilla.org/en-US/docs/Web/API/Bluetooth

declare interface BluetoothRemoteGATTCharacteristic {
    uuid: string;
    service: BluetoothRemoteGATTService;
    properties: unknown;
    value: unknown;
}

declare interface BluetoothRemoteGATTService {
    device: BluetoothDevice;
    isPrimary: boolean;
    uuid: string;
    getCharacteristic: () => Promise<BluetoothRemoteGATTCharacteristic>;
    getCharacteristics: () => Promise<BluetoothRemoteGATTCharacteristic[]>;
}

declare interface BluetoothRemoteGATTServer {
    connected: boolean;
    device: BluetoothDevice;
    connect: () => Promise<BluetoothRemoteGATTServer>;
    disconnect: () => Promise<void>;
    getPrimaryService(): () => Promise<BluetoothRemoteGATTService>;
    getPrimaryServices(): () => Promise<BluetoothRemoteGATTService[]>;
}

declare interface BluetoothDevice {
    id: string;
    name: string;
    gatt: BluetoothRemoteGATTServer;
    onadvertisementreceived: () => void;
    ongattserverdisconnected: () => void;
    watchAdvertisements: () => Promise<void>;
    unwatchAdvertisements: () => Promise<void>;
    addEventListener: (eventName: string, eventHandler: (event) => void) => void;
}

/**
 * Implementation of Web Bluetooth Adapter for Danti
 * NOTE: The bluetooth device needs to be paired using the bluetooth functionalities of the OS, otherwise the bluetooth adapter won't be able to connect
 * 
 * This module runs on the front-end and uses Chrome experimental features 
 * To enable Chrome experimental features in the browser: chrome://flags/#enable-experimental-web-platform-features = true
 * To enable Chrome experimental features in Electron: experimentalFeatures = true, see https://www.electronjs.org/docs/latest/api/browser-window
 * For examples, see https://googlechrome.github.io/samples/web-bluetooth/
 */
export class ChromeWebBlueToothAdapter {

    // selected bluetooth device
    protected device: BluetoothDevice;

    /**
     * Constructor
     */
    constructor () { }

    /**
     * Search bluetooth devices
     */
    async activate (namePrefix?: string): Promise<boolean> {
        try {
            console.log(`[bluetooth] Searching ${namePrefix || "bluetooth"}...`);
            this.device = await navigator["bluetooth"].requestDevice({
                filters: namePrefix ? [{ namePrefix }] : undefined,
                acceptAllDevices: namePrefix ? undefined : true 
            });
            console.log(`[bluetooth] Found ${namePrefix} device`, {
                name: this.device?.name, 
                id: this.device?.id, 
                connected: this.device.gatt.connected
            });
            // attach relevant listeners
            this.watchAdvertisements();
            // show connected devices, useful for debugging
            this.getDevices(namePrefix);
        } catch(error) {
            console.log("[web-blue-tooth] Connection aborted.", error);
        }
        return true;
    }

    /**
     * Watch service advertisements from the connected device
     */
    async watchAdvertisements (): Promise<boolean> {
        if (this.device) {
            console.log(`Watching advertisements from ${this.device.name}...`);
            this.device.addEventListener('advertisementreceived', (event) => {
                const info: string = `Advertisement received.
Device Name: ${event?.device?.name}
Device ID: ${event?.device?.id}
RSSI: ${event?.rssi}
TX Power: ${event?.txPower}
UUIDs: ${event?.uuids}`;
                console.log(info, {
                    manufacturer: event.manufacturerData, 
                    service: event.serviceData
                });
            });
            await this.device.watchAdvertisements();
            return true;
        }
        return false;
    }

    /**
     * Provides a list of connected bluetooth devices
     */
    async getDevices (namePrefix?: string): Promise<BluetoothDevice[]> {
        const devices: BluetoothDevice[] = await navigator["bluetooth"].getDevices();
        const candidates: BluetoothDevice[] = namePrefix ? devices.filter((dev: BluetoothDevice) => {
            return dev.name.startsWith(namePrefix)
        }) : devices;
        console.log(`[bluetooth] ${devices?.length} ${namePrefix || ""} bluetooth devices`, { devices, candidates });
        return candidates;
    }

    /**
     * Connect to the selected bluetooth device
     * NOTE: If the device require a PIN, we need to pair the device first with the OS (the library API does not seem to support entering a PIN yet)
     */
    async connect (namePrefix?: string): Promise<boolean> {
        await this.activate(namePrefix);
        if (this.device?.gatt) {
            console.log(`[bluetooth] Connecting to ${this.device.name}...`);
            const server: BluetoothRemoteGATTServer = await this.device?.gatt?.connect();
            console.log(server);
            return !!server;
        }
        return false;
    }
}