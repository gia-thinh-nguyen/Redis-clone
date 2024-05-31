import { connect } from "http2";
import * as net from "net";

// You can use print statements as follows for debugging, they'll be visible when running tests.
console.log("Logs from your program will appear here!");

// Uncomment this block to pass the first stage
const server: net.Server = net.createServer((connection: net.Socket) => {
  // Handle connection
  connection.on("data", (data:Buffer)=>{
    console.log("Data received: ",data.toString().split("\r\n"));
    const arr=data.toString().split("\r\n");
    const method = arr[2]; // Convert method to a string
    console.log("Method: ",method);
    console.log("Data: ",arr[4]);
    switch(method){
      case "PING":
        connection.write("+PONG\r\n");
        break;
      case "ECHO":
        connection.write(`*${arr[4].length}\r\n$${data.toString().split("\r\n")[4]}\r\n`);
        break;
      default:
        connection.write("-ERR unknown command\r\n");


    }
  })
});
//
server.listen(6379, "127.0.0.1");
