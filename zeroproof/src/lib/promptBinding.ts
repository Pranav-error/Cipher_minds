// Builds the challenge that WebAuthn must sign.
// challenge = SHA256(prompt || capGrantId || nonce || timestamp)
// This cryptographically binds the WebAuthn assertion to the exact prompt.

export async function buildChallenge(
  prompt: string,
  capGrantId: string,
  nonce: string,
  timestamp: number,
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const data = enc.encode(`${prompt}|${capGrantId}|${nonce}|${timestamp}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(hash);
}

export function bufferToBase64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function base64urlToBuffer(b64: string): Uint8Array {
  const base64 = b64.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf;
}

export function generateNonce(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return bufferToBase64url(arr);
}
