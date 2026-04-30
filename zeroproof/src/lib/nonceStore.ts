// In-memory nonce store with TTL. Each nonce is single-use.
// In production this would be Redis with atomic SETNX.

interface NonceEntry {
  expiresAt: number;
}

const store = new Map<string, NonceEntry>();

const TTL_MS = 60_000; // 60 seconds

const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NONCE_KEY_PREFIX = 'zeroproof:nonce:';

function hasRedisNonceStore(): boolean {
  return Boolean(UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN);
}

async function consumeNonceRedis(nonce: string): Promise<boolean> {
  const key = `${NONCE_KEY_PREFIX}${nonce}`;
  const qs = new URLSearchParams({ NX: 'true', PX: String(TTL_MS) });
  const response = await fetch(`${UPSTASH_REDIS_REST_URL}/set/${encodeURIComponent(key)}/1?${qs.toString()}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Nonce store unavailable (status ${response.status})`);
  }

  const body = await response.json() as { result?: string | null };
  return body.result === 'OK';
}

export async function consumeNonce(nonce: string): Promise<boolean> {
  if (hasRedisNonceStore()) {
    return consumeNonceRedis(nonce);
  }

  sweepExpired();
  if (store.has(nonce)) return false; // already used
  store.set(nonce, { expiresAt: Date.now() + TTL_MS });
  return true;
}

export function hasNonce(nonce: string): boolean {
  return store.has(nonce);
}

function sweepExpired() {
  const now = Date.now();
  for (const [key, val] of store) {
    if (val.expiresAt < now) store.delete(key);
  }
}
