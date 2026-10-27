import type {Station} from './types';
const EAST='https://www.jreast.co.jp/map/pdf/map_tokyo.pdf';
const TOKYU='https://www.tokyu.co.jp/railway/map/';
/** UI approximations of hues in official maps, not official RGB specifications. */
export const routeColors:Record<string,{color:string;source:string}>={
 'JR西日本|大阪環状線':{color:'#e60035',source:'https://www.jr-odekake.net/station/pdf/ubn.pdf'},
 'JR西日本|JR京都線':{color:'#0079bd',source:'https://www.jr-odekake.net/station/pdf/ubn.pdf'},
 'JR西日本|JR神戸線':{color:'#0079bd',source:'https://www.jr-odekake.net/station/pdf/ubn.pdf'},
 'JR西日本|JR京都線・JR神戸線':{color:'#0079bd',source:'https://www.jr-odekake.net/station/pdf/ubn.pdf'},
 'JR西日本|琵琶湖線':{color:'#0079bd',source:'https://www.jr-odekake.net/station/pdf/ubn.pdf'},
 'JR東日本|山手線':{color:'#9acd32',source:EAST},
 'JR東日本|中央線快速':{color:'#f58220',source:EAST},
 '東急電鉄|東横線':{color:'#df1854',source:TOKYU},
 '東急電鉄|目黒線':{color:'#0099bf',source:TOKYU},
 '東急電鉄|東急新横浜線':{color:'#8c3f91',source:TOKYU},
 '東急電鉄|田園都市線':{color:'#00a88f',source:TOKYU},
 '東急電鉄|大井町線':{color:'#f18b32',source:TOKYU},
 '東急電鉄|池上線':{color:'#df83a7',source:TOKYU},
 '東急電鉄|東急多摩川線':{color:'#a90084',source:TOKYU},
 '東急電鉄|世田谷線':{color:'#f5c400',source:TOKYU},
 '東急電鉄|こどもの国線':{color:'#178dc3',source:TOKYU},
};
export function luminance(hex:string){return hex.slice(1).match(/../g)!.map(x=>{const n=parseInt(x,16)/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((s,n,i)=>s+n*[.2126,.7152,.0722][i],0);}
export function routeTheme(station:Pick<Station,'operator'|'line'>){
 const route=routeColors[`${station.operator}|${station.line}`];
 const company=station.operator==='東急電鉄'?{color:'#c82032',source:TOKYU}:null;
 const color=route?.color??company?.color??'#31465b';
 const white=1.05/(luminance(color)+.05),black=(luminance(color)+.05)/.05;
 return {color,ink:white>=black?'#ffffff':'#000000',kind:route?'route':company?'company':'neutral',source:route?.source??company?.source??null};
}
