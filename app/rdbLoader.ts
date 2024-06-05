import * as fs from "fs";
import path from "path";
import { config,keyValueStore } from "./types";
import { bytesToString } from "./helper";

export function loadRDB(config:config){
    if(config.dbfilename===''){
      return {};
    }
    const filePath=path.join(config.dir,config.dbfilename);
    const rdb=new RDBParser(filePath);
    rdb.parse();
    return rdb.getEntries();
  }
  
class RDBParser{
path: string;
data: Uint8Array;
index: number = 0;
entries: keyValueStore = {};

constructor(path: string){
    this.path = path;
    try {
    this.data=fs.readFileSync(this.path);
    
    } catch (error) {
    console.log(`error reading RDB file: ${this.path}`);
    console.log(error);
    this.data = new Uint8Array();
    return;
    }
}
parse(){
    if(this.data===undefined) return;
    if(bytesToString(this.data.slice(0,5))!=="REDIS"){
    console.log(`Invalid RDB file: ${this.path}`);
    return;
    }
    console.log(`Version: ${bytesToString(this.data.slice(5,9))}`);
    //skip header and version
    this.index=9;
    let eof=false;
    while(!eof&&this.index<this.data.length){
    const op=this.data[this.index++];
    switch(op){
        case 0xFA:{
        const key=this.readEncodedString();
        switch(key){
            case "redis-ver":
            console.log(key, this.readEncodedString());
            break
            case "redis-bits":
            console.log(key, this.readEncodedInt());
            break;
            case "ctime":
            console.log(key, new Date(this.readEncodedInt() * 1000));
            break;
            case "used-mem":
            console.log(key, this.readEncodedInt());
            break;
            case "aof-preamble":
            console.log(key, this.readEncodedInt());
            break;
            default:
            throw Error("unknown auxiliary field");
        }
        break;
        }
        case 0xFB:
        console.log("keyspace", this.readEncodedInt());
        console.log("expires", this.readEncodedInt());
        this.readEntries();
        break;
        case 0xFE:
        console.log("db selector", this.readEncodedInt());
        break;
        case 0xFF:
        eof = true;
        break;
        default:
        throw Error("op not implemented: " + op);
        
    }
    if (eof) {
        break;
    }
    }
}
readEntries() {
    const now=new Date();
    while (this.index < this.data.length) {
    let type = this.data[this.index++];
    let expiration: Date | undefined;
    if (type === 0xFF) {
        this.index--;
        break;
    } else if (type === 0xFC) { // Expire time in milliseconds
        const milliseconds=this.readUnint64();
        expiration = new Date(Number(milliseconds));
        type = this.data[this.index++];
    } else if (type === 0xFD) { // Expire time in seconds
        const seconds=this.readUint32();
        expiration = new Date(Number(seconds) * 1000);
        type = this.data[this.index++];
    }
    const key = this.readEncodedString();
    switch (type) {
        case 0:  { // string encoding
            const value = this.readEncodedString();
            console.log(key, value, expiration);
            if ((expiration ?? now) >= now) {
              this.entries[key] = { value, expiration };
            }
        break;
        }
        default:
        throw Error("type not implemented: " + type);
    }
    }
}
readUint32():number{
    return (this.data[this.index++]+(this.data[this.index++]<<8)+(this.data[this.index++]<<16)+(this.data[this.index++]<<24))
}
readUnint64():bigint{
    let result = BigInt(0);
    let shift = BigInt(0);
    for(let i=0;i<8;i++){
        result+=BigInt(this.data[this.index++])<<shift;
        shift+=BigInt(8);
    }
    return result;
}


readEncodedInt(): number {
    let length = 0;
    const type = this.data[this.index] >> 6;
    switch (type) {
    case 0:
        length = this.data[this.index++];
        break;
    case 1:
        length =
        (this.data[this.index++] & 0b00111111) |
        (this.data[this.index++] << 6);
        break;
    case 2:
        this.index++;
        length =
        (this.data[this.index++] << 24) |
        (this.data[this.index++] << 16) |
        (this.data[this.index++] << 8) |
        this.data[this.index++];
        break;
    case 3: {
        const bitType = this.data[this.index++] & 0b00111111;
        length = this.data[this.index++];
        if (bitType > 1) {
        length |= this.data[this.index++] << 8;
        }
        if (bitType == 2) {
        length |=
            (this.data[this.index++] << 16) | (this.data[this.index++] << 24);
        }
        if (bitType > 2) {
        throw Error("length not implemented");
        }
        break;
    }
    }
    return length;
}
readEncodedString():string{
    const length=this.readEncodedInt();
    const str=bytesToString(this.data.slice(this.index,this.index+length));
    this.index+=length;
    return str;
}
getEntries():keyValueStore{
    return this.entries;
}
    
}