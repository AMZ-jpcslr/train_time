// Official station-timetable / route-guide colors, not vehicle body paint.
// Sources and the limits of station-specific colors: docs/mobile-interactions.md.
const JR:Record<string,string>={'普通':'#000000','快速':'#FF9900','新快速':'#0000FF','特急':'#FF0000'};
const HANKYU:Record<string,string>={'普通':'#000000','区間普通':'#000000','特急':'#EA5504','通勤特急':'#EA5504','準特急':'#EA5504','急行':'#F6AB00','快速':'#008CD6','準急':'#009D6B'};
export function trainTypeColor(stationId:string,type:string|null):string|null{
 if(!type)return null;
 // Match the leading service only: 普通（京都から快速） is still 普通 here.
 const name=type.normalize('NFKC').replace(/^A(?=新快速|快速)/,'').split(/[（(]/)[0].trim();
 if(stationId.startsWith('jr-')){
  if(/^(関空特急はるか|通勤特急らくラクびわこ)/.test(name))return JR['特急'];
  return JR[name]??null;
 }
 if(stationId.startsWith('hankyu-'))return HANKYU[name]??null;
 // No guessed colors for unverified services or through-train stopping patterns.
 return null;
}
