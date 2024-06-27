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
    gdl90_msg_heartbeat heartbeatMsg;
    gdl90_msg_traffic_report_t trafficReportMsg;
    gdl90_msg_ownship_geo_altitude ownshipGeoAltitude;

    switch (rawMsg->messageId) {
        case(MSG_ID_GDL90_EXT_101): {
            uint8_t submsg_id = get_gdl90_submsg_id(rawMsg);
            switch (submsg_id) {
                case (MSG_SUBID_DEVICE_INFO): {
                    decode_gdl90_device_info(rawMsg, &deviceInfoMsg);
                    JSON_OUTPUT ? json_gdl90_device_info(&deviceInfoMsg) : print_gdl90_device_info(&deviceInfoMsg);
                    break;
                }
                case (MSG_SUBID_AHRS): {
                    decode_gdl90_ahrs(rawMsg, &ahrsMsg);
                    JSON_OUTPUT ? json_gdl90_ahrs(&ahrsMsg) : print_gdl90_ahrs(&ahrsMsg);
                    break;
                }
                default: {
                    JSON_OUTPUT ? fprintf(stdout, "{ \"error\": \"Unknown GDL90_EXT_101 submessage ID %d!\" }", submsg_id) 
						: fprintf(stdout, "Unknown GDL90_EXT_101 submessage ID %d!\n", submsg_id);
                    break;
                }
            }
            break;
        }
		// variant of decode_gdl90_message from SoftRF
        case(MSG_ID_HEARTBEAT): {
            decode_gdl90_heartbeat(rawMsg, &heartbeatMsg);
            JSON_OUTPUT ? json_gdl90_heartbeat(&heartbeatMsg) : print_gdl90_heartbeat(&heartbeatMsg);
            break;
		}
        case(MSG_ID_TRAFFIC_REPORT):
            decode_gdl90_traffic_report(rawMsg, &trafficReportMsg);
            JSON_OUTPUT ? json_gdl90_traffic_report(&trafficReportMsg) : print_gdl90_traffic_report(&trafficReportMsg);
            break;

        case(MSG_ID_OWNSHIP_REPORT):
            decode_gdl90_traffic_report(rawMsg, &trafficReportMsg);
            JSON_OUTPUT ? json_gdl90_traffic_report(&trafficReportMsg) : print_gdl90_traffic_report(&trafficReportMsg);
            break;

        case(MSG_ID_OWNSHIP_GEOMETRIC):
            decode_gdl90_ownship_geo_altitude(rawMsg, &ownshipGeoAltitude);
            JSON_OUTPUT ? json_gdl90_ownship_geo_altitude(&ownshipGeoAltitude) : print_gdl90_ownship_geo_altitude(&ownshipGeoAltitude);
            break;

        default:
            fprintf(stdout, "Unknown message ID = %d!\n", rawMsg->messageId);
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
	fprintf(stdout, "\"type\": \"DEVICE_INFO\"");
    fprintf(stdout, ", \"version\": \"%d\"", decodedMsg->version);
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
	fprintf(stdout, "\"type\": \"AHRS\"");
    fprintf(stdout, ", \"roll\": { \"val\": \"%d\", \"units\": \"deg\" }", (int) decodedMsg->roll);
    fprintf(stdout, ", \"pitch\": { \"val\": \"%d\", \"units\": \"deg\" }", (int) decodedMsg->pitch);
    fprintf(stdout, ", \"heading\": { \"val\": \"%d\", \"units\": \"deg\" }", (int) decodedMsg->heading);
    fprintf(stdout, ", \"indicated_airspeed\": { \"val\": \"%d\", \"units\": \"kn\" }", (int) decodedMsg->ias);
    fprintf(stdout, ", \"true_airspeed\": { \"val\": \"%d\", \"units\": \"kn\" }", (int) decodedMsg->ias);
    fprintf(stdout, " }\n");
}

void json_gdl90_heartbeat(gdl90_msg_heartbeat *decodedMsg) {
    fprintf(stdout, "{ ");
	fprintf(stdout, "\"type\": \"HEARTBEAT\"");
    fprintf(stdout, ", \"gps_pos_valid\": %s", decodedMsg->gpsPosValid ? "true" : "false");
    fprintf(stdout, ", \"maintenance_req\": %s", decodedMsg->maintReq ? "true" : "false");
    fprintf(stdout, ", \"ident\": %d", decodedMsg->ident);
    fprintf(stdout, ", \"address_type\": %d", decodedMsg->addrType);
    fprintf(stdout, ", \"gps_battery_low\": %s", decodedMsg->gpsBattLow ? "true" : "false");
    fprintf(stdout, ", \"ratcs\": %s", decodedMsg->ratcs ? "true" : "false");
    fprintf(stdout, ", \"timestamp\": %d", decodedMsg->timestamp);
    fprintf(stdout, ", \"csa_requested\": %s", decodedMsg->csaRequested ? "true" : "false");
    fprintf(stdout, ", \"csa_not_available\": %s", decodedMsg->csaNotAvailable ? "true" : "false");
    fprintf(stdout, ", \"utc_ok\": %s", decodedMsg->utcOK ? "true" : "false");
    fprintf(stdout, ", \"message_counts\": %d", decodedMsg->messageCounts);
    fprintf(stdout, " }\n");
}

void json_gdl90_traffic_report(gdl90_msg_traffic_report_t *decodedMsg) {
	fprintf(stdout, "{ ");
	fprintf(stdout, "\"type\": \"TRAFFIC_REPORT\"");

    // Try and replicate the contents in section 3.5.4 of the GDL90 ICD
	fprintf(stdout, ", \"traffic_alert_status\": ");
    switch(decodedMsg->trafficAlertStatus) {
        case(NO_ALERT): {
			fprintf(stdout, "\"NO_ALERT\"");
			break;
		}
        case(TRAFFIC_ALERT):
		default: {
	        fprintf(stdout, "\"TRAFFIC_ALERT\"");
	        break;
		}
    }

	fprintf(stdout, ", \"address_type\": ");
    switch(decodedMsg->addressType) {
        case(ADS_B_WITH_ICAO_ADDRESS): {
			fprintf(stdout, "\"ADS_B_WITH_ICAO_ADDRESS\"");
			break;
		}
        case(ADS_B_WITH_SELF_ASSIGNED): {
			fprintf(stdout, "\"ADS_B_WITH_SELF_ASSIGNED\"");
			break;
		}
        case(TIS_B_WITH_ICAO_ADDRESS): {
			fprintf(stdout, "\"TIS_B_WITH_ICAO_ADDRESS\"");
			break;
		}
        case(TIS_B_WITH_TRACK_ID): {
			fprintf(stdout, "\"TIS_B_WITH_TRACK_ID\"");
			break;
		}
        case(SURFACE_VEHICLE): {
			fprintf(stdout, "\"SURFACE_VEHICLE\"");
			break;
		}
        case(GROUND_STATION_BEACON): {
			fprintf(stdout, "\"GROUND_STATION_BEACON\"");
			break;
		}
        default: {
			fprintf(stdout, "\"UNKNOWN\"");
			break;
		}
    }

    fprintf(stdout, ", \"address\": \"%o\"", decodedMsg->address);
    fprintf(stdout, ", \"latitude\": \"%f\"", decodedMsg->latitude);
    fprintf(stdout, ", \"longitude\": \"%f\"", decodedMsg->longitude);
    fprintf(stdout, ", \"pressure_altitude\": { \"val\": \"%f\", \"units\": \"ft\" }", decodedMsg->altitude);

	fprintf(stdout, ", \"airborne\": %s", decodedMsg->airborne ? "true" : "false");

	fprintf(stdout, ", \"report_type\":");
    switch(decodedMsg->reportType) {
        case(REPORT_UPDATED): {
			fprintf(stdout, "\"REPORT_UPDATED\"");
			break;
		}
        case(REPORT_EXTRAPOLATED): {
			fprintf(stdout, "\"REPORT_EXTRAPOLATED\"");
			break;
		}
        default: {
			fprintf(stdout, "\"UNKNOWN\"");
			break;
		}
    }

	fprintf(stdout, ", \"nic\":");
    switch(decodedMsg->nic) {
        case(NIC_LESS_20NM): {
			fprintf(stdout, "\"NIC_LESS_20NM\"");
			break;
		}
        case(NIC_LESS_8NM): {
			fprintf(stdout, "\"NIC_LESS_8NM\"");
			break;
		}
        case(NIC_LESS_4NM): {
			fprintf(stdout, "\"NIC_LESS_4NM\"");
			break;
		}
        case(NIC_LESS_2NM): {
			fprintf(stdout, "\"NIC_LESS_2NM\"");
			break;
		}
        case(NIC_LESS_1NM): {
			fprintf(stdout, "\"NIC_LESS_1NM\"");
			break;
		}
        case(NIC_LESS_0_6NM): {
			fprintf(stdout, "\"NIC_LESS_0_6NM\"");
			break;
		}
        case(NIC_LESS_0_2NM): {
			fprintf(stdout, "\"NIC_LESS_0_2NM\"");
			break;
		}
        case(NIC_LESS_0_1NM): {
			fprintf(stdout, "\"NIC_LESS_0_1NM\"");
			break;
		}
        case(NIC_HPL_75M_AND_VPL_112M): {
			fprintf(stdout, "\"NIC_HPL_75M_AND_VPL_112M\"");
			break;
		}
        case(NIC_HPL_25M_AND_VPL_37M): {
			fprintf(stdout, "\"NIC_HPL_25M_AND_VPL_37M\"");
			break;
		}
        case(NIC_HPL_7M_AND_VPL_11M): {
			fprintf(stdout, "\"NIC_HPL_7M_AND_VPL_11M\"");
			break;
		}
        case(NIC_UNKNOWN):
        default: {
			fprintf(stdout, "\"UNKNOWN\"");
			break;
		}
    }

	fprintf(stdout, ", \"nacp\":");
    switch(decodedMsg->nacp) {
        case(NACP_LESS_10NM): {
			fprintf(stdout, "\"NACP_LESS_10NM\"");
			break;
		}
        case(NACP_LESS_4NM): {
			fprintf(stdout, "\"NACP_LESS_10NM\"");
			break;
		}
        case(NACP_LESS_2NM): {
			fprintf(stdout, "\"NACP_LESS_2NM\"");
			break;
		}
        case(NACP_LESS_0_5NM): {
			fprintf(stdout, "\"NACP_LESS_0_5NM\"");
			break;
		}
        case(NACP_LESS_0_3NM): {
			fprintf(stdout, "\"NACP_LESS_0_3NM\"");
			break;
		}
        case(NACP_LESS_0_1NM): {
			fprintf(stdout, "\"NACP_LESS_0_1NM\"");
			break;
		}
        case(NACP_LESS_0_05NM): {
			fprintf(stdout, "\"NACP_LESS_0_05NM\"");
			break;
		}
        case(NACP_HFOM_30M_AND_VFOM_45M): {
			fprintf(stdout, "\"NACP_HFOM_30M_AND_VFOM_45M\"");
			break;
		}
        case(NACP_HFOM_10M_AND_VFOM_15M): {
			fprintf(stdout, "\"NACP_HFOM_10M_AND_VFOM_15M\"");
			break;
		}
        case(NACP_HFOM_3M_AND_VFOM_4M): {
			fprintf(stdout, "\"NACP_HFOM_3M_AND_VFOM_4M\"");
			break;
		}
        case(NACP_UNKNOWN):
        default: {
			fprintf(stdout, "\"UNKNOWN\"");
			break;
		}
    }

	fprintf(stdout, ", \"horizontal_velocity\": { \"val\": \"%f\", \"units\": \"kn\" }", decodedMsg->horizontalVelocity);
	fprintf(stdout, ", \"track_or_heading\": { \"val\": \"%f\", \"units\": \"kn\"", decodedMsg->trackOrHeading);
	fprintf(stdout, ", \"type\":");
    switch(decodedMsg->ttType) {
        case(TT_TYPE_TRUE_TRACK): {
			fprintf(stdout, "\"TRUE_TRACK\" }");
			break;
		}
        case(TT_TYPE_MAG_HEADING): {
			fprintf(stdout, "\"MAG_HEADING\" }");
			break;
		}
        case(TT_TYPE_TRUE_HEADING): {
			fprintf(stdout, "\"TRUE_HEADING\" }");
			break;
		}
        case(TT_TYPE_INVALID): {
			default:
			fprintf(stdout, "\"INVALID\" }");
			break;
		}
    }
    fprintf(stdout, ", \"vertical_velocity\": { \"val\": \"%f\", \"units\": \"fpm\" }", decodedMsg->verticalVelocity);

	fprintf(stdout, ", \"emergency_code\":");
    switch(decodedMsg->emergencyCode) {
        case(EMERGENCY_NONE): {
			fprintf(stdout, "\"NONE\"");
			break;
		}
        case(EMERGENCY_GENERAL): {
			fprintf(stdout, "\"GENERAL\"");
			break;
		}
        case(EMERGENCY_MEDICAL): {
			fprintf(stdout, "\"MEDICAL\"");
			break;
		}
        case(EMERGENCY_MIN_FUEL): {
			fprintf(stdout, "\"MIN_FUEL\"");
			break;
		}
        case(EMERGENCY_NO_COMM): {
			fprintf(stdout, "\"NO_COMM\"");
			break;
		}
        case(EMERGENCY_UNLAWFUL_INT): {
			fprintf(stdout, "\"UNLAWFUL_INT\"");
			break;
		}
        case(EMERGENCY_DOWNED): {
			fprintf(stdout, "\"DOWNED\"");
			break;
		}
        default: {
			fprintf(stdout, "\"INVALID\"");
			break;
		}
    }

	fprintf(stdout, ", \"emitter_category\":");
    switch(decodedMsg->emitterCategory) {
        case(EMIITER_NO_INFO): {
			fprintf(stdout, "\"NO_INFO\"");
			break;
		}
        case(EMITTER_LIGHT): {
			fprintf(stdout, "\"LIGHT\"");
			break;
		}
        case(EMITTER_SMALL): {
			fprintf(stdout, "\"SMALL\"");
			break;
		}
        case(EMITTER_LARGE): {
			fprintf(stdout, "\"LARGE\"");
			break;
		}
        case(EMITTER_HIGH_VORTEX): {
			fprintf(stdout, "\"HIGH_VORTEX\"");
			break;
		}
        case(EMITTER_HEAVY): {
			fprintf(stdout, "\"HEAVY\"");
			break;
		}
        case(EMITTER_HIGH_MANUEVER): {
			fprintf(stdout, "\"HIGH_MANUEVER\"");
			break;
		}
        case(EMITTER_ROTORCRAFT): {
			fprintf(stdout, "\"ROTORCRAFT\"");
			break;
		}
        case(EMITTER_GLIDER): {
			fprintf(stdout, "\"GLIDER\"");
			break;
		}
        case(EMITTER_LIGHTER_THAN_AIR): {
			fprintf(stdout, "\"LIGHTER_THAN_AIR\"");
			break;
		}
        case(EMITTER_PARACHUTIST): {
			fprintf(stdout, "\"PARACHUTIST\"");
			break;
		}
        case(EMITTER_ULTRA_LIGHT): {
			fprintf(stdout, "\"ULTRA_LIGHT\"");
			break;
		}
        case(EMITTER_UAV): {
			fprintf(stdout, "\"UAV\"");
			break;
		}
        case(EMITTER_SPACE): {
			fprintf(stdout, "\"SPACE\"");
			break;
		}
        case(EMITTER_SURFACE_EMERG): {
			fprintf(stdout, "\"SURFACE_EMERG\"");
			break;
		}
        case(EMITTER_SURFACE_SERVICE): {
			fprintf(stdout, "\"SURFACE_SERVICE\"");
			break;
		}
        case(EMITTER_POINT_OBSTACLE): {
			fprintf(stdout, "\"POINT_OBSTACLE\"");
			break;
		}
        case(EMITTER_CLUSTER_OBST): {
			fprintf(stdout, "\"CLUSTER_OBST\"");
			break;
		}
        case(EMITTER_LINE_OBSTACLE): {
			fprintf(stdout, "\"LINE_OBSTACLE\"");
			break;
		}
        default: {
			fprintf(stdout, "\"UNKNOWN\"");
			break;
		}
    }

    fprintf(stdout, ", \"tail_number\": \"");
    for(int i=0; i < GDL90_TRAFFICREPORT_MSG_CALLSIGN_SIZE; i++) {
        fprintf(stdout, "%c", decodedMsg->callsign[i]);
    }
    fprintf(stdout, "\"");
	fprintf(stdout, " }\n");
}

void json_gdl90_ownship_geo_altitude (gdl90_msg_ownship_geo_altitude *decodedMsg) {
	fprintf(stdout, "{ ");
	fprintf(stdout, "\"type\": \"OWNSHIP_GEO_ALTITUDE\"");
    fprintf(stdout, ", \"geometric_altitude\": { \"val\": \"%f\", \"units\": \"ft\" }", decodedMsg->ownshipGeoAltitude);
    fprintf(stdout, ", \"vertical_warning_indicator\": \"%d\"", decodedMsg->verticalWarningIndicator);
    fprintf(stdout, ", \"vertial_figure_of_merit\": \"%f\"\n", decodedMsg->verticalFigureOfMerit);
	fprintf(stdout, " }\n");
}
