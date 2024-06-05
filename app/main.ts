import exp from "constants";
import { connect } from "http2";
import * as net from "net";
import {argv} from "node:process";
import { simpleString,bulkString,arrays,nullBulkString,integer,parseBuffer,unknownCommand,handleHandshake,base64RDB,doubleDash} from "./helper";
import {config} from "./types";
import {loadRDB} from "./rdbLoader";

// You can use print statements as follows for debugging, they'll be visible when running tests.
console.log("Logs from your program will appear here!");
console.log(argv)


const configStore:config={dir:"",dbfilename:""};
if(argv.includes("--dir")){
  configStore.dir=doubleDash(argv,"--dir");
}
if(argv.includes("--dbfilename")){
  configStore.dbfilename=doubleDash(argv,"--dbfilename");
}

const redisStore=loadRDB(configStore)
let expire_time;
let PORT=parseInt(argv[3])||6379;
let propagatedCommands:net.Socket[]=[]
let offset=0;
let record=false;
let ackRep=0;
let pendingCommands=0;
const master_replid="8371b4fb1155b71f4a04d3e1bc3e18c4a990aeeb";
const base64="UkVESVMwMDEx+glyZWRpcy12ZXIFNy4yLjD6CnJlZGlzLWJpdHPAQPoFY3RpbWXCbQi8ZfoIdXNlZC1tZW3CsMQQAPoIYW9mLWJhc2XAAP/wbjv+wP9aog==";

// Uncomment this block to pass the first stage
const server: net.Server = net.createServer((connection: net.Socket) => {
  
  // Handle connection
  connection.on("data", (data:Buffer)=>{
    const arr=parseBuffer(data);
    console.log("Data received: ",arr);
    
    const method = arr[2]; 
    const key = arr[4];
    const value = arr[6];
    const px = arr[8];
    const time=arr[10];
    switch(method.toUpperCase()){
      case "PING":
          simpleString(connection,"PONG");
          break;
      case "ECHO":
        bulkString(connection,key);
        break;
      case "SET":
        simpleString(connection,"OK");
        redisStore[key]={value:value};
        if(px&&px.toLowerCase()==="px"){
          expire_time=parseInt(time);
          setTimeout(()=>{
            delete redisStore[key];
          },expire_time)
        }
        pendingCommands++;
        propagatedCommands.forEach(connection => {
          arrays(connection,["SET",key,value]);
        });
        
        break;
      case "GET":
        if(redisStore[key]){
          bulkString(connection,redisStore[key].value);
        }
        else{
          nullBulkString(connection);
        }
        break;
      case "INFO":
        const role=argv.includes("--replicaof")?"slave":"master"
        bulkString(connection,[`role:${role}`,`master_replid:${master_replid}`,`master_repl_offset:0`].join("\r\n"));
        break;
      case "REPLCONF":
        if(arr[4]==="ACK") {ackRep++;pendingCommands--;}
        else{simpleString(connection,"OK")}
        break;
      case "PSYNC":
        simpleString(connection,`+FULLRESYNC ${master_replid} 0`);
        base64RDB(connection,base64);
        propagatedCommands.push(connection)
        offset = 0;
        break;
      case "WAIT":
          if(pendingCommands===0) integer(connection,propagatedCommands.length);
          const expectedAckReps=parseInt(arr[4]);
          let timeout=parseInt(arr[6]);
          const waitInterval=setInterval(()=>{
            console.log(ackRep,expectedAckReps)
            if(ackRep>=expectedAckReps||timeout<=0){
              integer(connection,ackRep);
              clearInterval(waitInterval);
              ackRep=0
            }
            timeout-=100;
          },100)
          propagatedCommands.forEach(connection => {
            arrays(connection,["REPLCONF","GETACK","*"]);
          });
        break;
      case "CONFIG":
        switch(arr[6]){
          case "dir":
            arrays(connection,["dir",configStore.dir])
            break;
          case "dbfilename":
            arrays(connection,["dbfilename",configStore.dbfilename])
            break;
          default:
            unknownCommand(connection);
        }
        break;
      case "KEYS":
        arrays(connection,Object.keys(redisStore));
        break;
      case "TYPE":
        if(redisStore[key]){
          redisStore[key].type?simpleString(connection,redisStore[key].type!):simpleString(connection,"string");
        }
        else{
          simpleString(connection,"none");
        }
        break;
      case "XADD":
        const stream_key=key;
        const stream_value=value;
        redisStore[stream_key]={value:stream_value,type:"stream"};
        bulkString(connection,value);
        break;
      default:
        unknownCommand(connection);
    }
  })
});


if(argv.includes("--replicaof")){
  const slavePort=doubleDash(argv,"--port");
  const [masterHost,masterPort]=doubleDash(argv,"--replicaof").split(" ");

  const repSocket = net.connect({host: masterHost, port: parseInt(masterPort)},async () => {
    arrays(repSocket,["PING"]);
    await handleHandshake(repSocket,"+PONG",["REPLCONF","listening-port",slavePort])
    await handleHandshake(repSocket,"+OK",["REPLCONF","capa","psync2"]);
    await handleHandshake(repSocket,"+OK",["PSYNC","?","-1"]);
    repSocket.on("data",(data)=>{
      if (record) offset+=Buffer.byteLength(data);
      const arr=parseBuffer(data);
      const commands=arr.slice(2); //skip rdb file
      for(let i=0;i<commands.length;i++){
        if(commands[i]==="SET"){
          redisStore[commands[i+2]]={value:commands[i+4]};
          
        }
        if(commands[i]==="GETACK"){
          arrays(repSocket,["REPLCONF","ACK",offset.toString()])
          record=true;
        }
      }
    })
  });

}



server.listen(PORT, "127.0.0.1");
