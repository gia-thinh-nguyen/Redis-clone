import net from 'net';
import { keyValueStore,streamValue } from './types';
import { bulkString, bulkArray,subArray,joinedArray,nullBulkString } from './helper';
export const handleHandshake= async(repSocket:net.Socket,expectedResponse:string,command:string[])=>{
    return new Promise<void>((resolve)=>{
      repSocket.once("data",(data)=>{
        if(data.toString().trim()===expectedResponse){
          repSocket.write(bulkArray(command));
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
          for(const stream of redisStore[key].value as { id: string; field: string[]; }[]){
            const [ms,seq]=stream.id.split("-").map(Number);
            if(ms===milliseconds){
              sequence=seq+1;
            }
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
  
  export const updateStream=(connection:net.Socket,key:string,redisStore:keyValueStore,lastStreamValue:streamValue,milliseconds:number,sequence:number,arr:string[]):streamValue=>{
      const id = `${milliseconds}-${sequence}`;
      lastStreamValue = { milliseconds, sequence };
      const field=[]
      for(let i=8;i<arr.length;i+=2){
        field.push(arr[i]);
      }
      if (!redisStore[key]) {
        redisStore[key] = { value: [], type: "stream" };
      }
      (redisStore[key].value as { id: string; field: string[]; }[]).push({ id, field });
      
      connection.write(bulkString(id));
      return lastStreamValue;
  }

  export const rangeStream=(redisStore:keyValueStore,millisecondsStart:number,sequenceStart:number,millisecondsEnd:number,sequenceEnd:number):string=>{
    let range = [];
    for (const key in redisStore) {
      if (redisStore[key].type === "stream") {
        for (const stream of redisStore[key].value as { id: string; field: string[]; }[]) {
          const [ms, seq] = stream.id.split("-").map(Number);
          if (ms > millisecondsStart || (ms === millisecondsStart && seq >= sequenceStart)) {
            if (ms < millisecondsEnd || (ms === millisecondsEnd && seq <= sequenceEnd)) {
              range.push(stream);
            }
          }
        }
      }
    }
    const rangeStrings = range.map(item => 
      `*2\r\n${bulkString(item.id)}${subArray(item.field)}`
    );
    return joinedArray(rangeStrings);
  }
  export const rangeStreamPlus=(redisStore:keyValueStore,millisecondsStart:number,sequenceStart:number):string=>{
    let range = [];
    for (const key in redisStore) {
      if (redisStore[key].type === "stream") {
        for (const stream of redisStore[key].value as { id: string; field: string[]; }[]) {
          const [ms, seq] = stream.id.split("-").map(Number);
          if (ms > millisecondsStart || (ms === millisecondsStart && seq >= sequenceStart)) {
            range.push(stream);
          }
        }
      }
    }
    const rangeStrings = range.map(item => 
      `*2\r\n${bulkString(item.id)}${subArray(item.field)}`
    );
    return joinedArray(rangeStrings);
  }

  export const readStream=(redisStore:keyValueStore,readMap:Map<string,string>,lastStreamValue:streamValue):string=>{
    let readResult=[];
    let msRead: number, seqRead: number;
    for(const key of readMap.keys()){
      const value=readMap.get(key);
      if(value==="$"){[msRead,seqRead]=[lastStreamValue.milliseconds, lastStreamValue.sequence];}
      else { [msRead,seqRead]=value!.split("-").map(Number);}
      for(const stream of redisStore[key]?.value as { id: string; field: string[]; }[]){
        const [msStream,seqStream]=stream.id.split("-").map(Number);
        if(msStream>msRead||(msStream===msRead&&seqStream>seqRead)){
          readResult.push(`*2\r\n${bulkString(key)}*1\r\n*2\r\n${bulkString(stream.id)}${subArray(stream.field)}`);
        }
      }
    } 
    if(readResult.length===0) return nullBulkString();
    return joinedArray(readResult);
  }