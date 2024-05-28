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

#ifndef GDL90_EXT_H_
#define GDL90_EXT_H_

#define GDL90_DEVICE_SERIAL_NUMBER_LEN             (8)
#define GDL90_DEVICE_NAME_LEN                      (8)
#define GDL90_DEVICE_LONG_NAME_LEN                 (16)

// These are the lengths of the payloads, so doesn't include frame, message ID/subID, or CRC
#define GDL90_MSG_LEN_DEVICE_INFO                  (37)

typedef enum {
    MSG_ID_GDL90_EXT_101 = 101, // 0x65
} gdl_ext_msg_id_t;

typedef enum {
    MSG_SUBID_DEVICE_INFO = 0,
    MSG_SUBID_AHRS = 1,
} gdl_submsg_id_t;

typedef struct {
    uint8_t subId; // must be MSG_SUBID_DEVICE_INFO
    uint8_t version; // must be 1
    uint8_t deviceSerialNumber[GDL90_DEVICE_SERIAL_NUMBER_LEN + 1]; // 0xFFFFFFFFFFFFFFFF for invalid. +1 is for the string terminator
    char deviceName[GDL90_DEVICE_NAME_LEN + 1]; // 8B UTF8 string. +1 is for the string terminator
    char deviceLongName[GDL90_DEVICE_LONG_NAME_LEN + 1]; // 16B UTF8 string. Can be the same as Device name. Used when there is sufficient space for a longer string. +1 is for the string terminator
    uint8_t capabilitiesMask[4];
} gdl90_msg_device_info;

typedef struct {
    uint8_t subId; // must be MSG_SUBID_AHRS
    uint16_t roll; // Roll in units of 1/10 degree. Positive values indicate right wing down, negative values indicate right wing up. 0x7fff for invalid.
    uint16_t pitch; // Pitch in units of 1/10 degree. Positive values indicate nose up, negative values indicate nose down. 0x7fff for invalid.
    uint16_t heading; // Heading in units of 1/10 degree. Most significant bit (bit 15) 0: True Heading, 1: Magnetic Heading. Bits 14-0: Heading in units of 1/10 degree. 0xffff for invalid.
    uint16_t ias; // indicated airspeed [kn]
    uint16_t tas; // true airspeed [kn]
} gdl90_msg_ahrs;

void decode_gdl90_message_ext(gdl_message_t *rawMsg);
bool decode_gdl90_device_info(gdl_message_t *rawMsg, gdl90_msg_device_info *deviceInfoMsg);
void print_gdl90_device_info(gdl90_msg_device_info *decodedMsg);
void json_gdl90_device_info(gdl90_msg_device_info *decodedMsg);
uint8_t get_gdl90_submsg_id(gdl_message_t *rawMsg);
bool decode_gdl90_ahrs(gdl_message_t *rawMsg, gdl90_msg_ahrs *ahrsMsg);
void print_gdl90_ahrs(gdl90_msg_ahrs *decodedMsg);
void json_gdl90_ahrs(gdl90_msg_ahrs *decodedMsg);

// whether decoded messages are printed in json format
extern bool JSON_OUTPUT;

#endif  // GDL90_EXT_H_
