// -------------------- udp client ----------------
import * as dgram from 'node:dgram';

// creating a client socket
const client: dgram.Socket = dgram.createSocket('udp4');

// buffer msg
const msgs: { [key:string]: number[]} = {
  "traffic_report_1": [
    0x7e,
    0x14,
    0x00, 0xfd, 0x6a, 0xfd, 0x1a, 0x46, 0x37, 0xfd, 
    0xfd, 0xfd, 0x4b, 0x09, 0xfd, 0x1d, 0x1f, 0xfd,
    0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0xfd,
    0x7e
  ],
  "ownship_report_1": [
	0x7e,
	0x0a,
	0x0a, 0x7e, 0x14, 0x00, 0xfd, 0x40, 0x7b, 0x1a,
	0x27, 0xfd, 0x67, 0x65, 0x5f, 0x09, 0xfd, 0x1c,
	0xfd, 0x00, 0x71, 0x03, 0x52, 0x4f, 0x55, 0x31,
	0x38, 0x35, 0x36, 0x20, 0x00, 0x33, 0x3d, 0x7e,
	0x0a, 0x0a, 0x7e, 0x14, 0x00, 0xfd, 0xfd, 0xfd,
	0x1a, 0xfd, 0xfd, 0x76, 0x36, 0x57, 0xfd, 0xfd,
	0x1b, 0xfd, 0x01, 0xfd, 0x03, 0x4e, 0x4b, 0x53,
	0x31, 0x36, 0x37, 0x37, 0x20, 0x00, 0x2d, 0x47
  ],
  "healthbeat_report_1": [
	0x7e,
	0x00,
	0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0xfd, 0x76
  ],
  "foreflight_message_1": [
	0x7e, //126
	0x65, //101
	0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
	0x7a, 0x4e, 0x53, 0x74, 0x72, 0x61, 0x74, 0x75,
	0x73, 0x00, 0x53, 0x74, 0x72, 0x61, 0x74, 0x75,
	0x73, 0x33, 0x30, 0x33, 0x31, 0x33, 0x31, 0x30,
	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x74, 0x2b
  ],
  "foreflight_message_1_dec": [
	126,
	101,
	0,     1,   0,   0,   0,   0,   0,   0,
	122,  78,  83, 116, 114,  97, 116, 117,
	115,   0,  83, 116, 114,  97, 116, 117, 
	115,  51,  48,  51,  49,  51,  49,  48,
	0,     0,   0,   0,   0,   0, 116,  43
  ],
  "foreflight_message_2": [
	0x7e,
	0x65,
	0x01, 0x00, 0x00, 0x00, 0x00, 0xfd, 0xfd, 0xfd,
	0xfd, 0xfd, 0xfd, 0x74, 0x04, 0x7e, 0x0a, 0x0a
  ]
}


client.on('message', (msg, info) => {
  console.log('Data received from server : ' + msg.toString());
  console.log('Received %d bytes from %s:%d\n', msg.length, info.address, info.port);
});

//send msgs
const keys: string[] = Object.keys(msgs);
for (let i = 0; i < keys.length; i++) {
	const data: number[] = msgs[keys[i]];
	const buf: Buffer = Buffer.from([ ...data ]);
	client.send(buf, 4000, 'localhost', (error) => {
		if(error){
			client.close();
		} else {
			console.dir(data);
		}
	});
}
