// Adjacent stations on the displayed line, not the next stop of a rapid/express train.
// Source links and verification scope: docs/timeline-design.md.
const pairs:Record<string,{forward:string;before:string;after:string}>={
 'kobe-gakuentoshi':{forward:'east',before:'伊川谷',after:'総合運動公園'},
 'kobe-myohoji':{forward:'east',before:'名谷',after:'板宿'},
 'kyoto-imadegawa':{forward:'north',before:'丸太町',after:'鞍馬口'},
 'jr-nishinomiya':{forward:'east',before:'さくら夙川',after:'甲子園口'},
 'jr-osaka':{forward:'east',before:'塚本',after:'新大阪'},
 'jr-ibaraki':{forward:'east',before:'千里丘',after:'JR総持寺'},
 'jr-minamikusatsu':{forward:'east',before:'瀬田',after:'草津'},
 'hankyu-rokko':{forward:'east',before:'王子公園',after:'御影'},
 'hankyu-sannomiya':{forward:'east',before:'花隈',after:'春日野道'},
 'hankyu-umeda':{forward:'west',before:'始発駅',after:'中津'},
 'hanshin-koshien':{forward:'east',before:'久寿川',after:'鳴尾・武庫川女子大前'},
};
export function neighboringStations(stationId:string,directionId:string){
 const pair=pairs[stationId];
 return !pair?{before:'隣駅未確認',after:'隣駅未確認'}:directionId===pair.forward?pair:{before:pair.after,after:pair.before};
}
