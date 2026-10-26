import type { Station } from '../domain/types';
import odptStations from './odpt-stations.json' with {type:'json'};
import kobeExpandedStations from './kobe-expanded-stations.json' with {type:'json'};
import kobeKaiganStations from './kobe-kaigan-stations.json' with {type:'json'};
import jrStationCatalog from './jr-station-catalog.json' with {type:'json'};
// Coordinates are approximate station centres, used ONLY to rank nearby stations.
// They are never treated as verified entrances or walking routes.
export const stations: Station[] = [
 {id:'kobe-gakuentoshi',name:'学園都市',operator:'神戸市営地下鉄',line:'西神・山手線',code:'S14',lat:34.6811,lon:135.0582,directions:[{id:'east',name:'三宮・新神戸・谷上方面'},{id:'west',name:'西神中央方面'}],sourceUrl:'https://kotsu.city.kobe.lg.jp/subway/timetable1/gakuentoshi/'},
 {id:'kobe-myohoji',name:'妙法寺',operator:'神戸市営地下鉄',line:'西神・山手線',code:'S11',lat:34.6754,lon:135.1108,directions:[{id:'east',name:'三宮・新神戸・谷上方面'},{id:'west',name:'西神中央方面'}],sourceUrl:'https://kotsu.city.kobe.lg.jp/subway/timetable1/myohoji/'},
 {id:'jr-nishinomiya',name:'JR西宮',operator:'JR西日本',line:'JR神戸線',code:'JR',lat:34.7388,lon:135.3474,directions:[{id:'east',name:'大阪・京都方面'},{id:'west',name:'三ノ宮・姫路方面'}],sourceUrl:'https://eki.jr-odekake.net/top?id=0610136'},
 {id:'jr-osaka',name:'JR大阪',operator:'JR西日本',line:'JR京都線・JR神戸線',code:'JR',lat:34.7025,lon:135.4959,directions:[{id:'east',name:'京都・草津方面'},{id:'west',name:'三ノ宮・姫路方面'}],sourceUrl:'https://eki.jr-odekake.net/top?id=0610130'},
 {id:'jr-ibaraki',name:'JR茨木',operator:'JR西日本',line:'JR京都線',code:'JR',lat:34.815,lon:135.562,directions:[{id:'east',name:'京都・草津方面'},{id:'west',name:'大阪・三ノ宮方面'}],sourceUrl:'https://eki.jr-odekake.net/top?id=0610124'},
 {id:'jr-minamikusatsu',name:'JR南草津',operator:'JR西日本',line:'琵琶湖線',code:'JR',lat:35.0037,lon:135.9476,directions:[{id:'east',name:'草津・米原方面'},{id:'west',name:'京都・大阪方面'}],sourceUrl:'https://eki.jr-odekake.net/top?id=0610149'},
 {id:'kyoto-imadegawa',name:'今出川',operator:'京都市営地下鉄',line:'烏丸線',code:'K06',lat:35.0301,lon:135.7593,directions:[{id:'south',name:'京都・竹田・近鉄奈良方面'},{id:'north',name:'北大路・国際会館方面'}],sourceUrl:'https://www2.city.kyoto.lg.jp/kotsu/tikadia/hyperdia/menu0216.htm'},
 {id:'hankyu-rokko',name:'阪急六甲',operator:'阪急電鉄',line:'神戸線',code:'HK13',lat:34.7195,lon:135.2341,directions:[{id:'east',name:'大阪梅田方面'},{id:'west',name:'神戸三宮方面'}],sourceUrl:'https://www.hankyu.co.jp/station/rokko.html'},
 {id:'hankyu-sannomiya',name:'阪急神戸三宮',operator:'阪急電鉄',line:'神戸線',code:'HK16',lat:34.6933,lon:135.1927,directions:[{id:'east',name:'大阪梅田方面'},{id:'west',name:'新開地・姫路方面'}],sourceUrl:'https://www.hankyu.co.jp/station/sannomiya.html'},
 {id:'hankyu-umeda',name:'阪急大阪梅田',operator:'阪急電鉄',line:'神戸線',code:'HK01',lat:34.7055,lon:135.4983,directions:[{id:'west',name:'神戸三宮・新開地方面'}],sourceUrl:'https://www.hankyu.co.jp/station/umeda.html/'},
 {id:'hanshin-koshien',name:'阪神甲子園',operator:'阪神電気鉄道',line:'阪神本線',code:'HS14',lat:34.723885,lon:135.363285,directions:[{id:'east',name:'大阪梅田・大阪難波・近鉄奈良方面'},{id:'west',name:'神戸三宮・山陽姫路方面'}],sourceUrl:'https://www.hanshin.co.jp/station/koshien.html'}
 ,...kobeExpandedStations,...kobeKaiganStations,...jrStationCatalog,...odptStations
];
