// Stateless signed-token session.
// Replaces the in-memory Map store so it works across serverless instances.
// Each token is: base64url(JSON payload) + "." + base64url(HMAC-SHA256 signature)

const DEV_FALLBACK_SECRET = 'zeroproof-dev-secret-change-in-prod';
let warnedMissingSecret = false;

function getSecret(): string {
  const configured = process.env.WEBAUTHN_SECRET?.trim();
  if (configured) return configured;

  if (process.env.NODE_ENV === 'development') {
    if (!warnedMissingSecret) {
      warnedMissingSecret = true;
      console.warn('[ZeroProof] WEBAUTHN_SECRET is missing. Using insecure development fallback secret.');
    }
    return DEV_FALLBACK_SECRET;
  }

  throw new Error('WEBAUTHN_SECRET is required in non-development environments.');
}

async function getKey(usage: KeyUsage) {
  const secret = getSecret();
  const keyBytes = new TextEncoder().encode(secret.padEnd(32, '0').slice(0, 32));
  return crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

export async function signToken(payload: object): Promise<string> {
  const dataB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const key = await getKey('sign');
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(dataB64));
  return `${dataB64}.${Buffer.from(sig).toString('base64url')}`;
}

export async function verifyToken<T extends object>(token: string): Promise<T | null> {
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const dataB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  const key = await getKey('verify');
  const valid = await crypto.subtle.verify(
    'HMAC', key,
    Buffer.from(sigB64, 'base64url'),
    new TextEncoder().encode(dataB64),
  );
  if (!valid) return null;
  const payload = JSON.parse(Buffer.from(dataB64, 'base64url').toString()) as T & { exp?: number };
  if (payload.exp && payload.exp < Date.now()) return null;
  return payload;
}

// Token shapes
export interface CredentialPayload {
  credentialId: string;
  publicKeyHex: string;   // hex-encoded COSE public key
  counter: number;
  userId: string;
  exp: number;
}

export interface ChallengePayload {
  challenge: string;      // base64url challenge string
  userId: string;
  context: 'reg' | 'grant' | 'prompt';
  exp: number;
  extra?: string;         // JSON-stringified context data (grantJson, promptData, etc.)
}

export interface GrantPayload {
  sessionId: string;
  granted: string[];
  issuedAt: number;
  expiresAt: number;
}
