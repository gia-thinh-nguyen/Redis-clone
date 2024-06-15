import * as net from "net";
import {argv} from "node:process";
import { simpleString,bulkString,bulkArray,nullBulkString,integer,parseBuffer,simpleError,doubleDash} from "./helper";
import {handleHandshake,base64RDB,updateStream,autoGenerateTimeSeq,autoGenerateSeq, rangeStream, rangeStreamPlus, readStream} from "./function";
import {config,streamValue} from "./types";
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
let lastStreamValue:streamValue;
let recordNewXADD=false;
let newXADD=false;
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
          connection.write(simpleString("PONG"));
          break;
      case "ECHO":
        connection.write(bulkString(key));
        break;
      case "SET":
        connection.write(simpleString("OK"));
        redisStore[key]={value:value};
        if(px&&px.toLowerCase()==="px"){
          expire_time=parseInt(time);
          setTimeout(()=>{
            delete redisStore[key];
          },expire_time)
        }
        pendingCommands++;
        propagatedCommands.forEach(connection => {
          connection.write(bulkArray(["SET",key,value]));
        });
        
        break;
      case "GET":
        if(redisStore[key]&&typeof redisStore[key].value==="string"){
          connection.write(bulkString(redisStore[key].value as string));
        }
        else{
          connection.write(nullBulkString());
        }
        break;
      case "INFO":
        const role=argv.includes("--replicaof")?"slave":"master"
        connection.write(bulkString([`role:${role}`,`master_replid:${master_replid}`,`master_repl_offset:0`].join("\r\n")));
        break;
      case "REPLCONF":
        if(arr[4]==="ACK") {ackRep++;pendingCommands--;}
        else{connection.write(simpleString("OK"));}
        break;
      case "PSYNC":
        connection.write(simpleString(`+FULLRESYNC ${master_replid} 0`));
        base64RDB(connection,base64);
        propagatedCommands.push(connection)
        offset = 0;
        break;
      case "WAIT":
          if(pendingCommands===0) connection.write(integer(propagatedCommands.length));
          const expectedAckReps=parseInt(arr[4]);
          let timeout=parseInt(arr[6]);
          const waitInterval=setInterval(()=>{
            if(ackRep>=expectedAckReps||timeout<=0){
              connection.write(integer(ackRep));
              clearInterval(waitInterval);
              ackRep=0
            }
            timeout-=100;
          },100)
          propagatedCommands.forEach(connection => {
            connection.write(bulkArray(["REPLCONF","GETACK","*"]));
          });
        break;
      case "CONFIG":
        switch(arr[6]){
          case "dir":
            connection.write(bulkArray(["dir",configStore.dir]));
            break;
          case "dbfilename":
            connection.write(bulkArray(["dbfilename",configStore.dbfilename]));
            break;
          default:
            connection.write(simpleError("unknown command"));
        }
        break;
      case "KEYS":
        connection.write(bulkArray(Object.keys(redisStore)));
        break;
      case "TYPE":
        if(redisStore[key]){
          redisStore[key].type?connection.write(simpleString(redisStore[key].type!)):connection.write(simpleString("string"));
        }
        else{
          connection.write(simpleString("none"));
        }
        break;
      case "XADD":
        let [milliseconds, sequence] = value.split("-").map(Number);
        if(isNaN(milliseconds)){
          [milliseconds, sequence] = autoGenerateTimeSeq(redisStore);
          lastStreamValue = updateStream(connection, key, redisStore, lastStreamValue, milliseconds, sequence,arr);
          break;
        }
        if(isNaN(sequence)){
          if(milliseconds<0) connection.write(simpleError("The ID specified in XADD must be greater than 0-0"));
          sequence = autoGenerateSeq(milliseconds, lastStreamValue);
          lastStreamValue = updateStream(connection, key, redisStore, lastStreamValue, milliseconds, sequence,arr);
          break;
        }
        if (milliseconds<0||sequence<0||milliseconds+sequence<1){connection.write(simpleError("The ID specified in XADD must be greater than 0-0"));}
        else if (lastStreamValue && (milliseconds<lastStreamValue.milliseconds ||sequence<=lastStreamValue.sequence )) {
          connection.write(simpleError("The ID specified in XADD is equal or smaller than the target stream top item"));
        } 
        else {
          lastStreamValue = updateStream(connection, key, redisStore, lastStreamValue, milliseconds, sequence,arr);
        }
        if(recordNewXADD){
          newXADD=true;
          recordNewXADD=false;
        }
        break;
      case "XRANGE":
        let [millisecondsStart, sequenceStart] = arr[6].split("-").map(Number);
        let [millisecondsEnd, sequenceEnd] = arr[8].split("-").map(Number);
        if(arr[8]==="+"){
          const result=rangeStreamPlus(redisStore,millisecondsStart,sequenceStart);
          connection.write(result);
          break;
        }
        const result=rangeStream(redisStore,millisecondsStart,sequenceStart,millisecondsEnd,sequenceEnd);
        connection.write(result);
        break;
      case "XREAD":
        const readMap=new Map();
        const startIndex=arr.indexOf("streams")+2; //start index of first read
        const halfLength=(arr.length-startIndex)/2;
        for(let i=0;i<halfLength;i+=2){
          readMap.set(arr[startIndex+i],arr[startIndex+halfLength+i]);
        }
        const clonedLastStreamValue=lastStreamValue;
        const handleReadResult=()=>{const readResult=readStream(redisStore,readMap,clonedLastStreamValue);connection.write(readResult);}
        if(arr.includes("block")){
          const blockTime=parseInt(arr[6]);
          if(blockTime==0){
            recordNewXADD=true;
            const interval=setInterval(()=>{
              if(newXADD){
                clearInterval(interval);
                newXADD=false;
                handleReadResult();
              }
            },100)
            break;
          }
          setTimeout(handleReadResult, blockTime);
          break;
        }
        handleReadResult();
        break;
      default:
        connection.write(simpleError("unknown command"));
    }
  })
});


if(argv.includes("--replicaof")){
  const slavePort=doubleDash(argv,"--port");
  const [masterHost,masterPort]=doubleDash(argv,"--replicaof").split(" ");
  const repSocket = net.connect({host: masterHost, port: parseInt(masterPort)},async () => {
    repSocket.write(bulkArray(["PING"]));
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
          repSocket.write(bulkArray(["REPLCONF","ACK",offset.toString()]));
          record=true;
        }
      }
    })
  });

}

server.listen(PORT, "127.0.0.1");
