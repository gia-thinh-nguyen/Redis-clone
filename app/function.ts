import net from 'net';
import { keyValueStore,streamValue } from './types';
import { bulkString, arrays } from './helper';
export const handleHandshake= async(repSocket:net.Socket,expectedResponse:string,command:string[])=>{
    return new Promise<void>((resolve)=>{
      repSocket.once("data",(data)=>{
        if(data.toString().trim()===expectedResponse){
          arrays(repSocket,command);
          resolve();
        }
      })
    })
  }

export const base64RDB=(connection:net.Socket,base64:string)=>{
    const bufferFrom64=Buffer.from(base64,'base64');
    connection.write(`$${bufferFrom64.length}\r\n`)
    connection.write(bufferFrom64)
}
export const autoGenerateTimeSeq=(redisStore:keyValueStore):[number,number]=>{
    let [milliseconds, sequence]=[Date.now(),0];
      for(const key in redisStore){
        if(redisStore[key].type==="stream"){
          const [ms,seq]=redisStore[key].value.split("-").map(Number);
          if(ms===milliseconds){
            sequence=seq+1;
          }
        }
      }
      return [milliseconds,sequence];
  }
  
  export const autoGenerateSeq=(milliseconds:number, lastStreamValue:streamValue):number=>{
    let sequence;
    if (lastStreamValue && milliseconds === lastStreamValue.milliseconds) {
      sequence = lastStreamValue.sequence + 1;
    } else {
      sequence = milliseconds === 0 ? 1 : 0;
    }
    return sequence;
  }
  
  export const updateStream=(connection:net.Socket,key:string,redisStore:keyValueStore,lastStreamValue:streamValue,milliseconds:number,sequence:number):streamValue=>{
      const value = `${milliseconds}-${sequence}`;
      lastStreamValue = { milliseconds, sequence };
      redisStore[key] = { value:value, type: "stream" };
      bulkString(connection, value);
      return lastStreamValue;
  }