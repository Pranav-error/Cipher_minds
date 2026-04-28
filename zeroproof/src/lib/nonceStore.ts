// In-memory nonce store with TTL. Each nonce is single-use.
// In production this would be Redis with atomic SETNX.

interface NonceEntry {
  expiresAt: number;
}

const store = new Map<string, NonceEntry>();

const TTL_MS = 60_000; // 60 seconds

export function consumeNonce(nonce: string): boolean {
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
