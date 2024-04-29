#include "gdl90.h"
#include "gdl90_ext.h"

/**
 * Example gdl90 message received from Stratus3
 * Standard GDL90: https://www.faa.gov/sites/faa.gov/files/air_traffic/technology/adsb/archival/GDL90_Public_ICD_RevA.PDF
 * Extended GDL90: https://www.foreflight.com/connect/spec/
 * 
00000000: 7e14 00fd 6afd 1a46 37fd fdfd 4b09 fd1d  ~...j..F7...K...
00000010: 1ffd 1400 0000 0000 0000 0000 00fd 7e0a  ..............~.
00000020: 0a7e 1400 fd40 7b1a 27fd 6765 5f09 fd1c  .~...@{.'.ge_...
00000030: fd00 7103 524f 5531 3835 3620 0033 3d7e  ..q.ROU1856 .3=~
00000040: 0a0a 7e14 00fd fdfd 1afd fd76 3657 fdfd  ..~........v6W..
00000050: 1bfd 01fd 034e 4b53 3136 3737 2000 2d47  .....NKS1677 .-G
00000060: 7e0a
...
00000170: 0a0a 7e00 0100 0000 0000 fd76 7e0a 0a7e  ..~........v~..~
00000180: 6500 0100 0000 0000 007a 4e53 7472 6174  e........zNStrat
00000190: 7573 0053 7472 6174 7573 3330 3331 3331  us.Stratus303131
000001a0: 3000 0000 0000 0074 2b7e 0a0a 7e69 0001  0......t+~..~i..
000001b0: 312e 352e 362e 3230 3500 0000 0000 0000  1.5.6.205.......
000001c0: 3033 3133 3130 6434 5820 0500 0000 0005  031310d4X ......
000001d0: fd7e 0a0a 7e65 0100 0000 00fd fdfd fdfd  .~..~e..........
000001e0: fd74 047e 0a0a 7e0a 0000 0000 0000 0000  .t.~..~.........
000001f0: 0000 0270 00fd fd00 0000 0000 0000 0000  ...p............
00000200: 0000 0054 fd7e 0a0a 7e65 0100 0000 00fd  ...T.~..~e......
00000210: fdfd fdfd fd74 047e 0a0a 7e0a 0000 0000  .....t.~..~.....
00000220: 0000 0000 0000 0270 00fd fd00 0000 0000  .......p........
00000230: 0000 0000 0000 0054 fd7e 0a0a 7e65 0100  .......T.~..~e..
00000240: 0000 00fd fdfd fdfd fd74 047e 0a0a 7e0a  .........t.~..~.
...
00003540: 7e65 0001 0000 0000 0000 7a4e 5374 7261  ~e........zNStra
00003550: 7475 7300 5374 7261 7475 7333 3033 3133  tus.Stratus30313
00003560: 3130 0000 0000 0000 742b 7e0a 0a7e 6900  10......t+~..~i.
...
00003700: 0000 0000 0000 0054 fd7e 0a0a 7e65 0100  .......T.~..~e..
00003710: 0000 00fd fdfd fdfd fd74 047e 0a0a 7e0a  .........t.~..~.
00003720: 0000 0000 0000 0000 0000 0270 00fd fd00  ...........p....
00003730: 0000 0000 0000 0000 0000 0054 fd7e 0a0a  ...........T.~..
...
00003740: 7e00 0100 0000 0000 fd76 7e0a 0a7e 6500  ~........v~..~e.
00003750: 0100 0000 0000 007a 4e53 7472 6174 7573  .......zNStratus
00003760: 0053 7472 6174 7573 3330 3331 3331 3000  .Stratus3031310.
00003770: 0000 0000 0074 2b7e 0a0a 7e69 0001 312e  .....t+~..~i..1.
00003780: 352e 362e 3230 3500 0000 0000 0000 3033  5.6.205.......03
00003790: 3133 3130 6434 5820 0500 0000 0005 fd7e  1310d4X .......~
000037a0: 0a0a 7e65 0100 0000 00fd fdfd fdfd fd74  ..~e...........t

*/

// server program for udp connection 
#include <stdio.h>
#include <string.h>
#include <sys/socket.h>
#include <arpa/inet.h>

int main(int argc, char* argv[]) {

    gdl_message_t traffic_report_1 = {
        .flag0 = 0x7e,
        .messageId = 0x14,
        .data = {
            0x00, 0xfd, 0x6a, 0xfd, 0x1a, 0x46, 0x37, 0xfd, 
            0xfd, 0xfd, 0x4b, 0x09, 0xfd, 0x1d, 0x1f, 0xfd,
            0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0xfd
        }
    };
    decode_gdl90_message(&traffic_report_1);
    printf("\n");

    gdl_message_t ownship_report_1 = {
        .flag0 = 0x7e,
        .messageId = 0x0a,
        .data = {
            0x0a, 0x7e, 0x14, 0x00, 0xfd, 0x40, 0x7b, 0x1a,
            0x27, 0xfd, 0x67, 0x65, 0x5f, 0x09, 0xfd, 0x1c,
            0xfd, 0x00, 0x71, 0x03, 0x52, 0x4f, 0x55, 0x31,
            0x38, 0x35, 0x36, 0x20, 0x00, 0x33, 0x3d, 0x7e,
            0x0a, 0x0a, 0x7e, 0x14, 0x00, 0xfd, 0xfd, 0xfd,
            0x1a, 0xfd, 0xfd, 0x76, 0x36, 0x57, 0xfd, 0xfd,
            0x1b, 0xfd, 0x01, 0xfd, 0x03, 0x4e, 0x4b, 0x53,
            0x31, 0x36, 0x37, 0x37, 0x20, 0x00, 0x2d, 0x47
        }
    };
    decode_gdl90_message_ext(&ownship_report_1);

    gdl_message_t heartbeat_report_1 = {
        .flag0 = 0x7e,
        .messageId = 0x00,
        .data = {
            0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0xfd, 0x76
        }
    };
    decode_gdl90_message_ext(&heartbeat_report_1);

    gdl_message_t foreflight_message_1 = {
        .flag0 = 0x7e,
        .messageId = 0x65,
        .data = {
            0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x7a, 0x4e, 0x53, 0x74, 0x72, 0x61, 0x74, 0x75,
            0x73, 0x00, 0x53, 0x74, 0x72, 0x61, 0x74, 0x75,
            0x73, 0x33, 0x30, 0x33, 0x31, 0x33, 0x31, 0x30,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x74, 0x2b

        }
    };
    decode_gdl90_message_ext(&foreflight_message_1);

    gdl_message_t foreflight_message_2 = {
        .flag0 = 0x7e,
        .messageId = 0x65,
        .data = {
            0x01, 0x00, 0x00, 0x00, 0x00, 0xfd, 0xfd, 0xfd,
            0xfd, 0xfd, 0xfd, 0x74, 0x04, 0x7e, 0x0a, 0x0a
        }
    };
    decode_gdl90_message_ext(&foreflight_message_2);
}