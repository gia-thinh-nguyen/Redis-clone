export type config={dir:string,dbfilename:string}
// export type keyValueStore={[key:string]:{value:string,expiration?:Date,type?:string,field?:string[]}}
export type keyValueStore = {
    [key: string]: {
    value: string | { id: string; field:string[]}[];
    expiration?: Date;
    type?: string;
    };
  };
export type streamValue={milliseconds:number,sequence:number}