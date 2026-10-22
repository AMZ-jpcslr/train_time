/** Small Redis REST adapter. Secrets stay in server environment; never log commands. */
export function createRedis(env = process.env, fetchImpl = fetch) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  let endpoint;
  try { endpoint = new URL(url); } catch { throw Error('共有キャッシュのURL設定を確認してください。'); }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw Error('共有キャッシュにはHTTPSのREST URLを指定してください。');
  return { async command(...args) {
    try {
      const response = await fetchImpl(endpoint, {method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(8000)});
      if (!response.ok) throw Error('Redis HTTP failure');
      const data = await response.json();
      if (data.error || !Object.hasOwn(data,'result')) throw Error('Redis command failure');
      return data.result;
    } catch { throw Error('共有キャッシュに接続できません。外部取得を停止しています。'); }
  }};
}

// All application deployments using the public routing service must share this namespace/database.
export const namespace = env => /^[a-zA-Z0-9_-]{1,60}$/.test(env.CACHE_NAMESPACE || '') ? env.CACHE_NAMESPACE : 'maniau-v1';
export const RELEASE_LOCK = `-- release-owned-lock
if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) end
return 0`;
export const ASSERT_LOCK = `-- assert-owned-live-lock
if redis.call('GET',KEYS[1]) == ARGV[1] and redis.call('PTTL',KEYS[1]) >= tonumber(ARGV[2]) then return 1 end
return 0`;
export async function releaseLock(redis,key,token) { return redis.command('EVAL',RELEASE_LOCK,1,key,token); }
