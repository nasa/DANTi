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

#define MAX_GDL90_BUFFER 2000
#define GDL90_PORT 4000

// external variables defined in gdl90_ext.c
extern bool JSON_OUTPUT;
extern bool HEX_OUTPUT;

int main(int argc, char* argv[]) {
    /* 
     * check command line arguments 
     */
    if (argc > 1) {
        for (int i = 1; i < argc; i++) {
            // fprintf(stderr, "argv[%d] = %s \n", i, argv[i]);
            if (strcmp(argv[i], "json") == 0 || strcmp(argv[i], "JSON") == 0) {
                // enable json output
                JSON_OUTPUT = true;
            }
            if (strcmp(argv[i], "hex") == 0 || strcmp(argv[i], "HEX") == 0) {
                // enable hex output
                HEX_OUTPUT = true;
            }
        }
    }
	if (JSON_OUTPUT) { fprintf(stdout, "{ \"info\": \"JSON output enabled\" }\n"); }
	if (HEX_OUTPUT) { fprintf(stdout, JSON_OUTPUT ? "{ \"info\": \"HEX output enabled\" }\n" : "HEX output enabled\n"); }

    struct sockaddr_in client_addr;
    // allocate receive buffer buffer
    int MAX_GDL90_DATA = MAX_GDL90_BUFFER;
    uint8_t gdl90_data[MAX_GDL90_DATA];
    socklen_t client_struct_length = sizeof(client_addr);
    
    // Clean buffers
    memset(gdl90_data, 0x7e, sizeof(gdl90_data));
    
    // Create UDP socket:
    int socket_desc = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    
    if(socket_desc < 0){
        JSON_OUTPUT ? printf("{ \"error\": \"Error while creating socket \"\n") : printf("Error while creating socket\n");
        return -1;
    }
    JSON_OUTPUT ? printf("{ \"info\": \"Socket created successfully\" }\n") : printf("Socket created successfully\n");
    
    // Set port and IP:
    struct sockaddr_in server_addr = {
        .sin_family = AF_INET,
        .sin_port = htons(GDL90_PORT),
        .sin_addr.s_addr = htonl(INADDR_ANY)
    };
    
    // Bind to the set port and IP:
    if(bind(socket_desc, (struct sockaddr*)&server_addr, sizeof(server_addr)) < 0){
        JSON_OUTPUT ? printf("{ \"error\": \"Couldn't bind to the port\" }\n") : printf("Couldn't bind to the port\n");
        return -1;
    }
    JSON_OUTPUT ? printf("{ \"info\": \"Done with binding\" }\n") : printf("Done with binding\n");
    
    JSON_OUTPUT ? printf("{ \"info\": \"Listening for incoming UDP messages on port %d...\" }\n\n", GDL90_PORT)
		: printf("Listening for incoming UDP messages on port %d...\n\n", GDL90_PORT);
    // Receive client's messages
    int needle = 0;
    while (true) {
        memset(gdl90_data, 0x7e, sizeof(gdl90_data));
        recvfrom(socket_desc, gdl90_data, sizeof(gdl90_data), 0, (struct sockaddr*)&client_addr, &client_struct_length);
        // printf("\nReceived message from IP: %s and port: %i\n", inet_ntoa(client_addr.sin_addr), ntohs(client_addr.sin_port));
        gdl_message_t msg = {
            .flag0 = gdl90_data[0],
            .messageId = gdl90_data[1]
        };
        if (HEX_OUTPUT) {
			if (JSON_OUTPUT) { printf("{ \"hex\": \""); }
            printf("%d %d", gdl90_data[0], gdl90_data[1]);
        }
        int len = 0;
        for (int i = 2; i < sizeof(gdl90_data) && gdl90_data[i] != 0x7e; i++) {
            msg.data[len] = gdl90_data[i];
            if (HEX_OUTPUT) {
                printf(" %d", msg.data[len]); // print byte value
            }
            len++;
        }
		if (HEX_OUTPUT && JSON_OUTPUT) { printf("\" }\n"); }
        if (!JSON_OUTPUT) { printf("\nReceived GDL90 message (type=%d length=%d)\n", msg.messageId, len); }
        decode_gdl90_message_ext(&msg);
    }
           
    return 0;
}