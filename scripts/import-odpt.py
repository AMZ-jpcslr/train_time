"""Reproducible GTFS ingestion; no credentials or third-party Python packages needed.

Raw archives and retrieval metadata are preserved under .cache/odpt. Run with
--refresh to acquire new snapshots; ordinary rebuilds preserve checkedAt.
"""
import argparse, csv, hashlib, io, json, math, re, urllib.request, zipfile
from collections import defaultdict, Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCES = [
    dict(id='toei', dataset='train-toei', operator='東京都交通局', region='東京',
         url='https://api-public.odpt.org/api/v4/files/Toei/data/Toei-Train-GTFS.zip',
         license='CC BY 4.0', licenseUrl='https://creativecommons.org/licenses/by/4.0/',
         attribution='東京都交通局・公共交通オープンデータ協議会'),
    dict(id='tosaden', dataset='tosaden_traffic_streetcar', operator='とさでん交通', region='高知',
         url='https://api-public.odpt.org/api/v4/files/odpt/TosadenTraffic/Streetcar.zip?date=current',
         license='CC BY 4.0', licenseUrl='https://creativecommons.org/licenses/by/4.0/',
         attribution='とさでん交通株式会社・公共交通オープンデータ協議会'),
    dict(id='hakodate', dataset='hakodate_city_alllines', operator='函館市電', region='北海道・函館',
         url='https://api-public.odpt.org/api/v4/files/odpt/HakodateCity/Alllines.zip?date=20260815',
         license='GTFSデータに関する利用の手引き（GTFS-RU）', licenseUrl='https://gtfs-jp.org/GTFS-RUL(ODPT).pdf',
         attribution='函館市企業局・公共交通オープンデータ協議会', restricted=True),
]

def dump(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))

def digest(value):
    return hashlib.sha256(value).hexdigest()

def iso(value):
    return datetime.strptime(value, '%Y%m%d').date().isoformat()

def calendars(cal, exceptions, info):
    """GTFS weekdays are literal weekdays; holidays come ONLY from exceptions."""
    result = defaultdict(set)
    names = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
    for row in cal:
        start, end = date.fromisoformat(iso(row['start_date'])), date.fromisoformat(iso(row['end_date']))
        if (end-start).days > 1500 or end < start:
            raise ValueError('Unbounded/invalid calendar')
        day = start
        while day <= end:
            if row[names[day.weekday()]] == '1': result[row['service_id']].add(day.isoformat())
            day += timedelta(days=1)
    for row in exceptions:
        values = result[row['service_id']]
        if row['exception_type'] == '1': values.add(iso(row['date']))
        elif row['exception_type'] == '2': values.discard(iso(row['date']))
        else: raise ValueError('Unknown calendar exception')
    for service, days in result.items():
        result[service] = {d for d in days if (not info.get('feed_start_date') or d >= iso(info['feed_start_date']))
                           and (not info.get('feed_end_date') or d <= iso(info['feed_end_date']))}
    return result

def parse_time(value):
    if not re.fullmatch(r'\d{1,2}:[0-5]\d:[0-5]\d', value): raise ValueError('Invalid GTFS time: '+value)
    h, m, s = map(int, value.split(':'))
    # Do not silently move a genuine 00:xx service to a different service day.
    if h < 4 or h > 27: raise ValueError('Outside app operating day: '+value)
    return f'{h:02}:{m:02}' + (f':{s:02}' if s else '')

def convert(raw, source, checked_at):
    z = zipfile.ZipFile(io.BytesIO(raw))
    def rows(name):
        if name not in z.namelist(): return []
        if z.getinfo(name).file_size > 100_000_000: raise ValueError('Oversized file')
        return list(csv.DictReader(io.StringIO(z.read(name).decode('utf-8-sig'))))
    info = rows('feed_info.txt')[0]
    if any(a['agency_timezone'] != 'Asia/Tokyo' for a in rows('agency.txt')): raise ValueError('Unsupported time zone')
    if rows('frequencies.txt'): raise ValueError('Frequency services need a separate adapter')
    stops = {r['stop_id']: r for r in rows('stops.txt')}
    routes = {r['route_id']: r for r in rows('routes.txt') if r['route_type'] in ('0','1','2','5','6','7','12')}
    trips = {r['trip_id']: r for r in rows('trips.txt') if r['route_id'] in routes}
    active = calendars(rows('calendar.txt'), rows('calendar_dates.txt'), info)
    translations = defaultdict(set)
    for r in rows('translations.txt'):
        if r.get('table_name') == 'stops' and r.get('field_name') == 'stop_name':
            key = r.get('field_value') or stops.get(r.get('record_id'), {}).get('stop_name')
            if key and r.get('translation'): translations[key].add(r['translation'])
    ordered = defaultdict(list)
    for r in rows('stop_times.txt'):
        if r['trip_id'] in trips: ordered[r['trip_id']].append(r)
    stations, groups, audit = {}, defaultdict(list), Counter()
    def line_for(route):
        if source['id'] == 'tosaden':
            # A north/south trip can turn into the east/west line. Present each
            # physical stop once and combine every boardable service at that stop.
            return 'とさでん路面電車（東西線・南北線）'
        return route['route_long_name'] or route['route_short_name'] + '系統'
    def identity(stop, line):
        # Line + published station name merges opposite tram platforms, not operators/lines.
        parent = stops.get(stop.get('parent_station'), stop)
        key = source['id'] + '/' + line + '/' + parent['stop_name']
        return 'odpt-' + source['id'] + '-' + digest(key.encode())[:16], parent
    for trip_id, times in ordered.items():
        trip = trips[trip_id]
        service = trip['service_id']
        if service not in active: raise ValueError('Missing service calendar')
        line = line_for(routes[trip['route_id']])
        times.sort(key=lambda r: int(r['stop_sequence']))
        if len({r['stop_sequence'] for r in times}) != len(times): raise ValueError('Duplicate stop sequence')
        for i, row in enumerate(times):
            audit['sourceStopTimes'] += 1
            if row.get('pickup_type', '0') not in ('','0'):
                audit['notBoardable'] += 1; continue
            if not row['departure_time'] or row.get('timepoint') == '0':
                audit['inexact'] += 1; continue
            stop = stops[row['stop_id']]
            sid, parent = identity(stop, line)
            if i+1 < len(times):
                next_stop = stops[times[i+1]['stop_id']]
                _, next_parent = identity(next_stop, line)
                direction_name = next_parent['stop_name']+'方面'
            else:
                # GTFS can end at an operator boundary while the train continues.
                # pickup_type=0 still permits boarding there; keep these departures.
                direction_name = '他社線への直通方面'
                audit['throughBoundary'] += 1
            direction = 'd-' + digest(direction_name.encode())[:12]
            lat, lon = float(parent['stop_lat']), float(parent['stop_lon'])
            if not (math.isfinite(lat) and math.isfinite(lon) and 20<lat<50 and 120<lon<150): raise ValueError('Invalid coordinates')
            if sid not in stations:
                stations[sid] = dict(id=sid, name=parent['stop_name'], operator=source['operator'], line=line,
                    code=parent.get('stop_code') or '電停', lat=lat, lon=lon, directions=[],
                    aliases=sorted(translations[parent['stop_name']]), region=source['region'],
                    sourceUrl='https://ckan.odpt.org/dataset/'+source['dataset'])
            elif abs(stations[sid]['lat']-lat) > .005 or abs(stations[sid]['lon']-lon) > .005:
                raise ValueError('Ambiguous same-name stops: '+sid)
            station = stations[sid]
            if not any(d['id']==direction for d in station['directions']):
                station['directions'].append(dict(id=direction, name=direction_name))
            destination = row.get('stop_headsign') or trip.get('trip_headsign') or stops[times[-1]['stop_id']]['stop_name']
            groups[(sid,direction,service)].append(dict(time=parse_time(row['departure_time']), destination=destination,
                trainType=None, platform=stop.get('platform_code') or None))
            audit['importedStopTimes'] += 1
    # Group dates by their exact active service set, then combine services before exposing a table.
    date_services = defaultdict(list)
    for service, dates in active.items():
        for d in sorted(dates): date_services[d].append(service)
    patterns = defaultdict(list)
    for d, services in sorted(date_services.items()): patterns[tuple(sorted(services))].append(d)
    output = {}
    for sid, station in stations.items():
        tables = []
        station['directions'].sort(key=lambda d:d['name'])
        for direction in station['directions']:
            for services, days in patterns.items():
                departures = [dep for service in services for dep in groups.get((sid,direction['id'],service), [])]
                if not departures: continue
                departures.sort(key=lambda d:(d['time'],d['destination']))
                tables.append(dict(id=sid+'-'+direction['id']+'-'+digest('|'.join(services).encode())[:10],
                    stationId=sid, operator=source['operator'], line=station['line'], directionId=direction['id'],
                    direction=direction['name'], dayType='weekday', departures=departures,
                    sourceUrl=source['url'], retrievedAt=checked_at, checkedAt=checked_at,
                    validFrom=days[0], validTo=days[-1], revisionDate=None, serviceDates=days,
                    verification='verified', notes=[source['attribution']+' / '+source['license']+' のデータを加工。',
                        'GTFSの運行日・例外日を適用。乗車不可・時刻未確定の行は発車案内に含めません。乗車可能な他社直通境界駅の発車は保持します。',
                        '方面は次の停車駅で分類。列車種別・駅入口は未収録。遅延・運休は未反映。',
                        '元データのバージョン: '+info.get('feed_version','不明')]))
        payload = dump(tables).encode()
        filename = sid + '-' + digest(payload)[:12] + '.json'
        station['timetablePath'] = '/data/odpt/'+filename
        output[filename] = payload
    return list(stations.values()), output, dict(audit), info

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--refresh',action='store_true'); args=parser.parse_args()
    cache=ROOT/'.cache/odpt'; cache.mkdir(parents=True,exist_ok=True)
    public=ROOT/'public/data/odpt'; public.mkdir(parents=True,exist_ok=True)
    all_stations, reports = [], []
    for source in SOURCES:
        archive=cache/(source['dataset']+'.zip'); meta=cache/(source['dataset']+'.metadata.json')
        if args.refresh or not meta.exists() or json.loads(meta.read_text(encoding='utf-8'))['url'] != source['url']:
            with urllib.request.urlopen(source['url'],timeout=60) as response: raw=response.read()
            stamp=datetime.now(timezone.utc).isoformat()
            # Content-addressed raw snapshot is never overwritten.
            (cache/(source['id']+'-'+digest(raw)+'.zip')).write_bytes(raw)
            archive.write_bytes(raw)
            meta.write_text(dump(dict(url=source['url'],sha256=digest(raw),retrievedAt=stamp)),encoding='utf-8')
        metadata=json.loads(meta.read_text(encoding='utf-8')); raw=archive.read_bytes()
        if digest(raw)!=metadata['sha256']: raise ValueError('Source hash mismatch')
        stations,files,audit,info=convert(raw,source,metadata['retrievedAt'])
        output_dir = cache/'hakodate-preview' if source.get('restricted') else public
        output_dir.mkdir(parents=True,exist_ok=True)
        for name,payload in files.items(): (output_dir/name).write_bytes(payload)
        if not source.get('restricted'): all_stations.extend(stations)
        report=dict(**source,sourceUrl='https://ckan.odpt.org/dataset/'+source['dataset'],
            checkedAt=metadata['retrievedAt'],sha256=metadata['sha256'],stationCount=len(stations),
            lines=[dict(name=line,stationCount=sum(s['line']==line for s in stations)) for line in sorted({s['line'] for s in stations})],
            validFrom=iso(info['feed_start_date']),validTo=iso(info['feed_end_date']),audit=audit,
            bytes=sum(map(len,files.values())), status='approval-required' if source.get('restricted') else 'imported')
        reports.append(report); print(source['id'],len(stations),audit,report['bytes'])
    (ROOT/'src/data/odpt-stations.json').write_text(dump(all_stations),encoding='utf-8')
    (ROOT/'src/data/odpt-coverage.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (ROOT/'docs/odpt-validation.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    # Preserve superseded generated files outside the deployable public folder.
    used={Path(s['timetablePath']).name for s in all_stations}
    retired=cache/'retired-generated';retired.mkdir(exist_ok=True)
    for old in public.glob('odpt-*.json'):
        if old.name not in used:
            if old.resolve().parent != public.resolve(): raise ValueError('Unsafe archive path')
            target=retired/old.name
            if target.resolve().parent != retired.resolve(): raise ValueError('Unsafe archive destination')
            old.replace(target)

if __name__=='__main__': main()
