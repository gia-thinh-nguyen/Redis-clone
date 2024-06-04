import net from 'net';

export const simpleString=(connection:net.Socket,str:string)=>connection.write(`+${str}\r\n`);
export const bulkString=(connection:net.Socket,str:string)=>connection.write(`$${str.length}\r\n${str}\r\n`); 
export const arrays=(connection:net.Socket,arr:string[])=>connection.write(`*${arr.length}\r\n${arr.map((str)=>`$${str.length}\r\n${str}`).join("\r\n")}\r\n`);
export const nullBulkString=(connection:net.Socket)=>connection.write(`$-1\r\n`);
export const integer=(connection:net.Socket,int:number)=>connection.write(`:${int}\r\n`);
export const unknownCommand=(connection:net.Socket)=>connection.write(`-ERR unknown command\r\n`);

export const parseBuffer=(data:Buffer):string[]=>{return data.toString().split("\r\n")}

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
export const doubleDash=(argv:string[],doubleDash:string):string=>{
    return argv[argv.indexOf(doubleDash)+1];
}

export const bytesToString=(arr:Uint8Array):string=>{
  return Array.from(arr).map((byte)=>String.fromCharCode(byte)).join('');
}