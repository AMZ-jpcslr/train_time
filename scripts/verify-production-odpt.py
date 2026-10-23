"""Read-only comparison of production assets and every indexed ODPT station file."""
import concurrent.futures, hashlib, json, re, urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = 'https://train-time-three.vercel.app'

def fetch(path):
    with urllib.request.urlopen(BASE + path, timeout=40) as response:
        return response.status, response.read()

html = fetch('/')[1].decode()
assets = re.findall(r'(?:src|href)="(/assets/[^\"]+)"', html)
assert assets, 'No production assets found'
checks = []
for path in assets:
    status, raw = fetch(path)
    assert raw == (ROOT / ('dist' + path)).read_bytes(), path
    checks.append(dict(path=path, status=status, sha256=hashlib.sha256(raw).hexdigest(), matchesLocalBuild=True))
live_sw = fetch('/sw.js')[1].decode()
local_sw = (ROOT / 'dist/sw.js').read_text(encoding='utf-8')
# Cache names also hash the generator's source bytes (Windows/Git line endings
# can differ); compare every other character and the exact precache file list.
normalize = lambda value: re.sub(r'mania-u-v2-[a-f0-9]{12}', 'mania-u-v2-BUILD', value.replace('\r\n', '\n'))
assert normalize(live_sw) == normalize(local_sw), 'Service worker logic differs'
index = json.loads((ROOT / 'src/data/odpt-stations.json').read_text(encoding='utf-8'))

def verify(station):
    path = station['timetablePath']
    status, raw = fetch(path)
    assert raw == (ROOT / ('public' + path)).read_bytes(), path
    return dict(station=station['name'], path=path, status=status, sha256=hashlib.sha256(raw).hexdigest())

with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    stations = list(pool.map(verify, index))
result = dict(checkedAt=datetime.now(timezone.utc).isoformat(), origin=BASE,
              assets=checks, serviceWorkerCache=re.search(r'mania-u-v2-[a-f0-9]{12}', live_sw)[0],
              serviceWorkerMatchesExceptCacheName=True, stationFiles=stations, matchedStationCount=len(stations))
(ROOT / 'docs/odpt-production-files-20261023.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k!='stationFiles'}, ensure_ascii=False))
