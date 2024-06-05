import net from 'net';

export const simpleString=(connection:net.Socket,str:string)=>connection.write(`+${str}\r\n`);
export const bulkString=(connection:net.Socket,str:string)=>connection.write(`$${str.length}\r\n${str}\r\n`); 
export const arrays=(connection:net.Socket,arr:string[])=>connection.write(`*${arr.length}\r\n${arr.map((str)=>`$${str.length}\r\n${str}`).join("\r\n")}\r\n`);
export const nullBulkString=(connection:net.Socket)=>connection.write(`$-1\r\n`);
export const integer=(connection:net.Socket,int:number)=>connection.write(`:${int}\r\n`);
export const simpleError=(connection:net.Socket,str:string)=>connection.write(`-ERR ${str}\r\n`);

export const parseBuffer=(data:Buffer):string[]=>{return data.toString().split("\r\n")}


export const doubleDash=(argv:string[],doubleDash:string):string=>{
    return argv[argv.indexOf(doubleDash)+1];
}

export const bytesToString=(arr:Uint8Array):string=>{
  return Array.from(arr).map((byte)=>String.fromCharCode(byte)).join('');
}

