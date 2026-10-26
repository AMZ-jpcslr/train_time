/** Runtime configuration crosses the network boundary as unknown, never as a trusted cast. */
export type RuntimeConfig = {
 enabled: boolean;
 provider: string;
 contactEmail: string | null;
 privacyUrl: string | null;
 localPrototype?: boolean;
 disabledReason?: string | null;
 deployment?: string;
 odptChallenge?: {enabled: boolean; configured: boolean; reason: string | null};
 western?: {enabled: boolean; coverage: {operator: string; line: string}[]};
};

function record(value: unknown): value is Record<string,unknown> {
 return value!==null&&typeof value==='object'&&!Array.isArray(value);
}
const text=(value:unknown):string|null=>typeof value==='string'&&value.length<=2000?value:null;
function publicHttps(value:unknown):string|null {
 if(typeof value!=='string')return null;
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}catch{return null;}
}

export function parseRuntimeConfig(value:unknown):RuntimeConfig {
 if(!record(value)||typeof value.enabled!=='boolean')throw Error('Invalid runtime configuration.');
 const result:RuntimeConfig={
  enabled:value.enabled,
  provider:text(value.provider)||'徒歩経路サービス',
  contactEmail:typeof value.contactEmail==='string'&&/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value.contactEmail)?value.contactEmail:null,
  privacyUrl:publicHttps(value.privacyUrl),
 };
 if(typeof value.localPrototype==='boolean')result.localPrototype=value.localPrototype;
 if(typeof value.deployment==='string')result.deployment=value.deployment;
 result.disabledReason=text(value.disabledReason);
 if(record(value.odptChallenge))result.odptChallenge={enabled:value.odptChallenge.enabled===true,configured:value.odptChallenge.configured===true,reason:text(value.odptChallenge.reason)};
 if(record(value.western)){
  const coverage=Array.isArray(value.western.coverage)?value.western.coverage:[];
  result.western={enabled:value.western.enabled===true,coverage:coverage.filter((item):item is {operator:string;line:string}=>record(item)&&typeof item.operator==='string'&&typeof item.line==='string').map(({operator,line})=>({operator,line}))};
 }
 return result;
}

/** Same-origin app APIs only. Endpoint-specific decoders own the response contract. */
export async function getJson<T>(path:`/api/${string}`,decode:(value:unknown)=>T,signal?:AbortSignal):Promise<T>{
 if(!path.startsWith('/api/')||/[\\\u0000-\u0020]/.test(path)||path.split(/[/?#]/).includes('..'))throw Error('Invalid app API path.');
 const response=await fetch(path,{method:'GET',headers:{Accept:'application/json'},credentials:'same-origin',redirect:'error',signal});
 if(!response.ok)throw Error(`App API HTTP ${response.status}`);
 return decode(await response.json());
}

export function getRuntimeConfig(signal?:AbortSignal):Promise<RuntimeConfig>{
 return getJson('/api/config',parseRuntimeConfig,signal);
}
