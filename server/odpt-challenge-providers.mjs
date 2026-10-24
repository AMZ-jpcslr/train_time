// Public identifiers and catalog URLs only. Credentials and acquired facts never live here.
export const challengeProviders=[
 ['jr-east','JR-East','JR東日本','jreast__r_station_timetable'],
 ['odakyu','Odakyu','小田急電鉄','odakyu__r_station_timetable'],
 ['keikyu','Keikyu','京急電鉄','keikyu__r_station_timetable'],
 ['sotetsu','Sotetsu','相模鉄道','sotetsu__r_station_timetable'],
 ['keio','Keio','京王電鉄','keio__r_station_timetable'],
 ['tobu','Tobu','東武鉄道','tobu__r_station_timetable'],
 ['seibu','Seibu','西武鉄道','seibu__r_station_timetable'],
 ['tokyu','Tokyu','東急電鉄','tokyu__r_station_timetable'],
].map(([id,code,name,dataset])=>({id,code,name,dataset,operator:`odpt.Operator:${code}`,sourceUrl:`https://ckan.odpt.org/dataset/${dataset}`}));
export const CHALLENGE_END='2027-03-12';
