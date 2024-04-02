#include "gdl90.h"
#include "gdl90_ext.h"

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
                    print_gdl90_device_info(&deviceInfoMsg);
                    break;
                }
                case (MSG_SUBID_AHRS): {
                    fprintf(stdout, "Processing AHRS Message\n");
                    decode_gdl90_ahrs(rawMsg, &ahrsMsg);
                    print_gdl90_ahrs(&ahrsMsg);
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
    fprintf(stdout, "Roll: %d [deg]\n", (int) decodedMsg->roll);
    fprintf(stdout, "Pitch: %d [deg]\n", (int) decodedMsg->pitch);
    fprintf(stdout, "Heading: %d [deg]\n", (int) decodedMsg->heading);
    fprintf(stdout, "Indicated Airspeed: %d [kn]\n", (int) decodedMsg->ias);
    fprintf(stdout, "True Airspeed: %d [kn]\n", (int) decodedMsg->ias);
}
