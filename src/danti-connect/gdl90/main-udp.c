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

int main(int argc, char* argv[]) {

    enum mode_t { AWAITING_MSG_START, RECEIVING, MSG_END };
    struct sockaddr_in client_addr;
    uint8_t receive_buffer[MAX_GDL90_BUFFER];
    uint8_t gdl90_data[GDL90_MSG_LEN_UPLINK_DATA + 4];
    socklen_t client_struct_length = sizeof(client_addr);
    mode_t mode = AWAITING_MSG_START;
    
    // Clean buffers:
    memset(receive_buffer, 0x7e, sizeof(receive_buffer));
    memset(gdl90_data, 0x7e, sizeof(gdl90_data));
    
    // Create UDP socket:
    int socket_desc = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    
    if(socket_desc < 0){
        printf("Error while creating socket\n");
        return -1;
    }
    printf("Socket created successfully\n");
    
    // Set port and IP:
    struct sockaddr_in server_addr = {
        .sin_family = AF_INET,
        .sin_port = htons(GDL90_PORT),
        .sin_addr.s_addr = inet_addr("127.0.0.1")
    };
    
    // Bind to the set port and IP:
    if(bind(socket_desc, (struct sockaddr*)&server_addr, sizeof(server_addr)) < 0){
        printf("Couldn't bind to the port\n");
        return -1;
    }
    printf("Done with binding\n");
    
    printf("Listening for incoming UDP messages on port %d...\n\n", GDL90_PORT);
    // Receive client's messages
    int needle = 0;
    while (true) {
        memset(receive_buffer, 0x7e, sizeof(receive_buffer));
        recvfrom(socket_desc, receive_buffer, sizeof(receive_buffer), 0, (struct sockaddr*)&client_addr, &client_struct_length);
        // printf("\nReceived message from IP: %s and port: %i\n", inet_ntoa(client_addr.sin_addr), ntohs(client_addr.sin_port));
        // wait for message start (0x7e) 
        if (mode == AWAITING_MSG_START) {
            if (receive_buffer[0] == 0x7e) {
                mode = RECEIVING;
                printf("Message START\n");
                printf("%d\n", receive_buffer[0]); // print hex number
            } else {
                printf("Awaiting MSG START\n");
            }
        } else if (mode == RECEIVING && receive_buffer[0] == 0x7e) {
            mode = MSG_END;
            needle = 0;
            printf("Message END\n");
            printf("Decoding START...\n");
            gdl_message_t msg = {
                .flag0 = 0x7e,
                .messageId = gdl90_data[0]
            };
            for (int i = 0; i < sizeof(gdl90_data) && gdl90_data[i] != 0x7e; i++) {
                printf("%d\n", gdl90_data[i]); // print hex number
                msg.data[i] = gdl90_data[i];
            }
            decode_gdl90_message(&msg);
            printf("Decoding END\n");
        } else {
            if (mode == RECEIVING) {
                gdl90_data[needle++] = receive_buffer[0];
                printf("%d\n", receive_buffer[0]); // print hex number
            }
        }
    }
           
    return 0;
}