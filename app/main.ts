import { connect } from "http2";
import * as net from "net";

// You can use print statements as follows for debugging, they'll be visible when running tests.
console.log("Logs from your program will appear here!");
const collection:{[key:string]:string}={};
// Uncomment this block to pass the first stage
const server: net.Server = net.createServer((connection: net.Socket) => {
  // Handle connection
  connection.on("data", (data:Buffer)=>{
    const arr=data.toString().split("\r\n");
    console.log("Data received: ",arr);
    
    const method = arr[2]; // Convert method to a string
    
    switch(method){
        case "PING":
          connection.write("+PONG\r\n");
          break;
      case "ECHO":
        connection.write(`$${arr[4].length}\r\n${arr[4]}\r\n`);
        break;
      case "SET":
        console.log(arr[4],arr[6])
        connection.write("+OK\r\n");
        collection[arr[4]]=arr[6];
        break;
      case "GET":
        console.log(collection)
        if(collection[arr[4]]){
          connection.write(`$${collection[arr[4]].length}\r\n${collection[arr[4]]}\r\n`);
        }
        else{
          connection.write(`$-1\r\n`)
        }
        break;
      default:
        connection.write("-ERR unknown command\r\n");


    }
  })
});
//
server.listen(6379, "127.0.0.1");
