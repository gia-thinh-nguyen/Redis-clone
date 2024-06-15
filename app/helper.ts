
export const simpleString=(str:string)=>`+${str}\r\n`;
export const bulkString=(str:string)=>`$${str.length}\r\n${str}\r\n`; 
export const bulkArray=(arr:string[])=>`*${arr.length}\r\n${arr.map((str)=>bulkString(str)).join("")}`;
export const subArray=(arr:string[])=>`*${arr.length}\r\n${arr.map((str)=>`$${str.length}\r\n${str}`).join("\r\n")}`;
export const joinedArray=(arr:string[])=>`*${arr.length}\r\n${arr.join("\r\n")}\r\n`;
export const nullBulkString=()=>`$-1\r\n`;
export const integer=(int:number)=>`:${int}\r\n`;
export const simpleError=(str:string)=>`-ERR ${str}\r\n`;

export const parseBuffer=(data:Buffer):string[]=>{return data.toString().split("\r\n")}


export const doubleDash=(argv:string[],doubleDash:string):string=>{
    return argv[argv.indexOf(doubleDash)+1];
}

export const bytesToString=(arr:Uint8Array):string=>{
  return Array.from(arr).map((byte)=>String.fromCharCode(byte)).join('');
}

