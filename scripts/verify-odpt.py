"""Independent source-to-output checks using CSV rows and date-specific multisets."""
import csv,io,json,zipfile,hashlib
from collections import Counter
from datetime import date
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
index=json.loads((ROOT/'src/data/odpt-stations.json').read_text(encoding='utf-8'))
reports=json.loads((ROOT/'src/data/odpt-coverage.json').read_text(encoding='utf-8'))
checks=[]
for source in reports:
 if source['status']!='imported':continue
 raw=(ROOT/'.cache/odpt'/(source['dataset']+'.zip')).read_bytes()
 assert hashlib.sha256(raw).hexdigest()==source['sha256']
 z=zipfile.ZipFile(io.BytesIO(raw))
 def rows(name):return list(csv.DictReader(io.StringIO(z.read(name).decode('utf-8-sig'))))
 stops={r['stop_id']:r['stop_name'] for r in rows('stops.txt')}
 trips={r['trip_id']:r for r in rows('trips.txt')}
 times=rows('stop_times.txt');calendar=rows('calendar.txt');exceptions=rows('calendar_dates.txt')
 station_tables=[(s,json.loads((ROOT/'public'/s['timetablePath'].lstrip('/')).read_text(encoding='utf-8'))) for s in index if s['id'].startswith('odpt-'+source['id']+'-')]
 for day in ['2026-10-23','2026-10-24','2026-10-25','2026-11-03','2026-12-31','2027-01-01',source['validTo']]:
  stamp=day.replace('-','');weekday=['monday','tuesday','wednesday','thursday','friday','saturday','sunday'][date.fromisoformat(day).weekday()]
  services={r['service_id'] for r in calendar if r['start_date']<=stamp<=r['end_date'] and r[weekday]=='1'}
  for r in exceptions:
   if r['date']==stamp:
    if r['exception_type']=='1':services.add(r['service_id'])
    else:services.discard(r['service_id'])
  expected=Counter()
  for row in times:
   trip=trips[row['trip_id']]
   if trip['service_id'] not in services or row['pickup_type']!='0' or not row['departure_time'] or row['timepoint']!='1':continue
   value=row['departure_time'];value=value[:-3] if value.endswith(':00') else value
   expected[(stops[row['stop_id']],value,row.get('stop_headsign') or trip['trip_headsign'])]+=1
  actual=Counter()
  for s,tables in station_tables:
   for t in tables:
    if day in t['serviceDates']:
     for d in t['departures']:actual[(s['name'],d['time'],d['destination'])]+=1
  assert expected==actual, (source['id'],day,'missing',list((expected-actual).items())[:5],'extra',list((actual-expected).items())[:5])
  checks.append(dict(operator=source['operator'],date=day,sourceDepartures=expected.total(),importedDepartures=actual.total(),difference=0))
duplicates=[]
for s in index:
 for table in json.loads((ROOT/'public'/s['timetablePath'].lstrip('/')).read_text(encoding='utf-8')):
  keys=[(d['time'],d['destination'],d['trainType'],d['platform']) for d in table['departures']]
  if len(set(keys))!=len(keys):duplicates.append(table['id'])
assert not duplicates, ('Ambiguous departure identifiers',duplicates[:10])
result=dict(checks=checks,ambiguousDepartureTables=duplicates,stationCount=len(index))
(ROOT/'docs/odpt-source-comparison.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result,ensure_ascii=False,indent=2))
