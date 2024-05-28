/**
 * @author: Paolo Masci
 * @date: 2024.05.28
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

#include "gdl90.h"
#include "gdl90_ext.h"

bool JSON_OUTPUT = false;

void decode_gdl90_message_ext(gdl_message_t *rawMsg) {
    gdl90_msg_device_info deviceInfoMsg;
    gdl90_msg_ahrs ahrsMsg;

    switch (rawMsg->messageId) {
        case(MSG_ID_GDL90_EXT_101): {
            uint8_t submsg_id = get_gdl90_submsg_id(rawMsg);
            switch (submsg_id) {
                case (MSG_SUBID_DEVICE_INFO): {
                    fprintf(stdout, "Processing Device Info Message\n");
                    decode_gdl90_device_info(rawMsg, &deviceInfoMsg);
                    JSON_OUTPUT ? json_gdl90_device_info(&deviceInfoMsg) : print_gdl90_device_info(&deviceInfoMsg);
                    break;
                }
                case (MSG_SUBID_AHRS): {
                    fprintf(stdout, "Processing AHRS Message\n");
                    decode_gdl90_ahrs(rawMsg, &ahrsMsg);
                    JSON_OUTPUT ? json_gdl90_ahrs(&ahrsMsg) : print_gdl90_ahrs(&ahrsMsg);
                    break;
                }
                default: {
                    fprintf(stdout, "Unknown GDL90_EXT_101 submessage ID %d!\n", submsg_id);
                    break;
                }
            }
            break;
        }
        default: {
            decode_gdl90_message(rawMsg);
            break;
        }
    }
    printf("\n");
}

char utf82char (u_int8_t code) {
    if (code >= 0 && code <= 9) { return '0' + code; }
    return (char) code;
}

uint8_t get_gdl90_submsg_id(gdl_message_t *rawMsg) {
    return rawMsg->data[0];
}

bool decode_gdl90_device_info(gdl_message_t *rawMsg, gdl90_msg_device_info *deviceInfoMsg) {
    bool rval = gdl90_verifyCrc(rawMsg, GDL90_MSG_LEN_DEVICE_INFO);

    int needle = 0;
    deviceInfoMsg->subId = rawMsg->data[needle++];
    deviceInfoMsg->version = rawMsg->data[needle++];

    for (int i = 0; i < GDL90_DEVICE_SERIAL_NUMBER_LEN; i++) {
        deviceInfoMsg->deviceSerialNumber[i] = utf82char(rawMsg->data[needle++]);
    }
    deviceInfoMsg->deviceSerialNumber[GDL90_DEVICE_SERIAL_NUMBER_LEN] = 0; // string terminator

    for (int i = 0; i < GDL90_DEVICE_NAME_LEN; i++) {
        deviceInfoMsg->deviceName[i] = (char) (rawMsg->data[needle++]);
    }
    deviceInfoMsg->deviceName[GDL90_DEVICE_NAME_LEN] = 0; // string terminator

    for (int i = 0; i < GDL90_DEVICE_LONG_NAME_LEN; i++) {
        deviceInfoMsg->deviceLongName[i] = (char) (rawMsg->data[needle++]);
    }
    deviceInfoMsg->deviceLongName[GDL90_DEVICE_LONG_NAME_LEN] = 0; // string terminator

    deviceInfoMsg->capabilitiesMask[0] = rawMsg->data[needle++];
    deviceInfoMsg->capabilitiesMask[1] = rawMsg->data[needle++];
    deviceInfoMsg->capabilitiesMask[2] = rawMsg->data[needle++];
    deviceInfoMsg->capabilitiesMask[3] = rawMsg->data[needle++];
    return rval;
}

void print_gdl90_device_info(gdl90_msg_device_info *decodedMsg) {
    fprintf(stdout, "Version: %d\n", decodedMsg->version);
    fprintf(stdout, "Device Serial Number: %s\n", decodedMsg->deviceSerialNumber);
    fprintf(stdout, "Device Name: %s\n", decodedMsg->deviceName);
    fprintf(stdout, "Device Long Name: %s\n", decodedMsg->deviceLongName);
}

void json_gdl90_device_info(gdl90_msg_device_info *decodedMsg) {
    fprintf(stdout, "{ ");
    fprintf(stdout, "\"version\": \"%d\"", decodedMsg->version);
    fprintf(stdout, ", \"device_serial_number\": \"%s\"", decodedMsg->deviceSerialNumber);
    fprintf(stdout, ", \"device_name\": \"%s\"", decodedMsg->deviceName);
    fprintf(stdout, ", \"device_long_name\": \"%s\"", decodedMsg->deviceLongName);
    fprintf(stdout, " }\n");
}

bool decode_gdl90_ahrs(gdl_message_t *rawMsg, gdl90_msg_ahrs *ahrsMsg) {
    // bool rval = gdl90_verifyCrc(rawMsg, GDL90_MSG_LEN_HEARTBEAT);

    int needle = 0;
    ahrsMsg->subId = rawMsg->data[needle++];
    ahrsMsg->roll = ((int16_t)((rawMsg->data[needle] << 8) + rawMsg->data[needle + 1]));
    needle += 2;
    ahrsMsg->pitch = ((int16_t)((rawMsg->data[needle] << 8) + rawMsg->data[needle + 1]));
    needle += 2;
    ahrsMsg->heading = ((int16_t)((rawMsg->data[needle] << 8) + rawMsg->data[needle + 1]));
    needle += 2;
    ahrsMsg->ias = ((int16_t)((rawMsg->data[needle] << 8) + rawMsg->data[needle + 1]));
    needle += 2;
    ahrsMsg->tas = ((int16_t)((rawMsg->data[needle] << 8) + rawMsg->data[needle + 1]));

    return true;
}

void print_gdl90_ahrs(gdl90_msg_ahrs *decodedMsg) {
    fprintf(stdout, "roll: %d [deg]\n", (int) decodedMsg->roll);
    fprintf(stdout, "Pitch: %d [deg]\n", (int) decodedMsg->pitch);
    fprintf(stdout, "Heading: %d [deg]\n", (int) decodedMsg->heading);
    fprintf(stdout, "Indicated Airspeed: %d [kn]\n", (int) decodedMsg->ias);
    fprintf(stdout, "True Airspeed: %d [kn]\n", (int) decodedMsg->ias);
}
void json_gdl90_ahrs(gdl90_msg_ahrs *decodedMsg) {
    fprintf(stdout, "{ ");
    fprintf(stdout, "\"roll\": { \"val\": \"%d\", \"units\": \"deg\" }", (int) decodedMsg->roll);
    fprintf(stdout, ", \"pitch\": { \"val\": \"%d\", \"units\": \"deg\" }", (int) decodedMsg->pitch);
    fprintf(stdout, ", \"heading\": { \"val\": \"%d\", \"units\": \"deg\" }", (int) decodedMsg->heading);
    fprintf(stdout, ", \"indicated_airspeed\": { \"val\": \"%d\", \"units\": \"kn\" }", (int) decodedMsg->ias);
    fprintf(stdout, ", \"true_airspeed\": { \"val\": \"%d\", \"units\": \"kn\" }", (int) decodedMsg->ias);
    fprintf(stdout, " }\n");
}
