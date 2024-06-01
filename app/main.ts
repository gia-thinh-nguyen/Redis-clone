import exp from "constants";
import { connect } from "http2";
import * as net from "net";
import {argv} from "node:process";

// You can use print statements as follows for debugging, they'll be visible when running tests.
console.log("Logs from your program will appear here!");
const collection:{[key:string]:string}={};
let expire_time;
let PORT=parseInt(argv[3])||6379;
// Uncomment this block to pass the first stage
const server: net.Server = net.createServer((connection: net.Socket) => {
  
  // Handle connection
  connection.on("data", (data:Buffer)=>{
    const arr=data.toString().split("\r\n");
    console.log("Data received: ",arr);
    
    const method = arr[2]; 
    const key = arr[4];
    const value = arr[6];
    const px = arr[8];
    const time=arr[10];
    switch(method){
        case "PING":
          connection.write("+PONG\r\n");
          break;
      case "ECHO":
        connection.write(`$${key.length}\r\n${key}\r\n`);
        break;
      case "SET":
        console.log(key,value)
        connection.write("+OK\r\n");
        collection[key]=value;
        if(px&&px.toLowerCase()==="px"){
          expire_time=parseInt(time);
          setTimeout(()=>{
            delete collection[key];
          },expire_time)
        }
        break;
      case "GET":
        console.log(collection)
        if(collection[key]){
          connection.write(`$${collection[key].length}\r\n${collection[key]}\r\n`);
        }
        else{
          connection.write(`$-1\r\n`)
        }
        break;
      case "INFO":
        if(argv.includes("--replicaof")){
          const string=`role:slave\r\nmaster_replid:8371b4fb1155b71f4a04d3e1bc3e18c4a990aeeb\r\nmaster_repl_offset:0\r\n`
          connection.write(`$${string.length}\r\n${string}\r\n`);
        }
        else{
          const string=`role:master\r\nmaster_replid:8371b4fb1155b71f4a04d3e1bc3e18c4a990aeeb\r\nmaster_repl_offset:0\r\n`
          connection.write(`$${string.length}\r\n${string}\r\n`);
        }
      default:
        connection.write("-ERR unknown command\r\n");


    }
  })
});
//
server.listen(PORT, "127.0.0.1");
