'use client';

import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import type { AgentCapability } from './capabilities';

// localStorage keys
const KEY_CREDENTIAL = 'zp_credential_token';
const KEY_GRANT = 'zp_grant_token';
const KEY_SESSION_ID = 'zp_session_id';

export function getStoredCredentialToken(): string | null {
  return localStorage.getItem(KEY_CREDENTIAL);
}

export function getStoredGrantToken(): string | null {
  return localStorage.getItem(KEY_GRANT);
}

export function getStoredSessionId(): string | null {
  return localStorage.getItem(KEY_SESSION_ID);
}

export function clearSession() {
  localStorage.removeItem(KEY_GRANT);
  localStorage.removeItem(KEY_SESSION_ID);
}

export async function registerUser(userId: string): Promise<{ credentialToken: string }> {
  // Get registration options + challengeToken from server
  const optRes = await fetch('/api/register?action=options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, username: `user-${userId.slice(0, 6)}` }),
  });
  if (!optRes.ok) throw new Error(await optRes.text());
  const { options, challengeToken } = await optRes.json();

  // WebAuthn ceremony (Touch ID / fingerprint)
  const regResponse = await startRegistration({ optionsJSON: options });

  // Verify — server returns a signed credentialToken
  const verRes = await fetch('/api/register?action=verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, response: regResponse, challengeToken }),
  });
  if (!verRes.ok) throw new Error(await verRes.text());
  const result = await verRes.json();
  if (!result.verified) throw new Error('Registration verification failed');

  localStorage.setItem(KEY_CREDENTIAL, result.credentialToken);
  return { credentialToken: result.credentialToken };
}

export async function grantCapabilities(
  userId: string,
  capabilities: AgentCapability[],
): Promise<{ sessionId: string; grantToken: string }> {
  const credentialToken = getStoredCredentialToken();
  if (!credentialToken) throw new Error('Not registered — call registerUser first');

  // Get grant options + challengeToken
  const optRes = await fetch('/api/grant?action=options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, capabilities, credentialToken }),
  });
  if (!optRes.ok) {
    const body = await optRes.json().catch(() => ({}));
    throw new Error(body.error ?? `Grant options failed: ${optRes.status}`);
  }
  const { options, sessionId, challengeToken } = await optRes.json();

  // WebAuthn ceremony to sign the capability grant
  const assertion = await startAuthentication({ optionsJSON: options });

  // Verify — server returns a signed grantToken
  const verRes = await fetch('/api/grant?action=verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, response: assertion, credentialToken, challengeToken }),
  });
  if (!verRes.ok) {
    const body = await verRes.json().catch(() => ({}));
    throw new Error(body.error ?? `Grant verify failed: ${verRes.status}`);
  }
  const result = await verRes.json();
  if (!result.verified) throw new Error('Capability grant signing failed');

  localStorage.setItem(KEY_GRANT, result.grantToken);
  localStorage.setItem(KEY_SESSION_ID, result.sessionId);
  return { sessionId: result.sessionId, grantToken: result.grantToken };
}

export async function signAndVerifyPrompt(
  userId: string,
  prompt: string,
  sessionId: string,
): Promise<{
  verified: boolean;
  reason?: string;
  attestation?: {
    challengeHash: string;
    nonce: string;
    timestamp: number;
    assertionClientDataJSON?: string;
  };
}> {
  const credentialToken = getStoredCredentialToken();
  const grantToken = getStoredGrantToken();
  if (!credentialToken || !grantToken) {
    return { verified: false, reason: 'Missing credential or grant token' };
  }

  const nonce = crypto.randomUUID();
  const timestamp = Date.now();

  // Get options — server binds challenge to SHA256(prompt|sessionId|nonce|timestamp)
  const optRes = await fetch('/api/verify?action=options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, prompt, sessionId, nonce, timestamp, credentialToken, grantToken }),
  });
  if (!optRes.ok) {
    const body = await optRes.json().catch(() => ({}));
    return { verified: false, reason: body.error ?? `Options failed: ${optRes.status}` };
  }
  const { options, challengeToken } = await optRes.json();

  // WebAuthn signs the challenge
  const assertion = await startAuthentication({ optionsJSON: options });

  // Verify on server
  const verRes = await fetch('/api/verify?action=assert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nonce, response: assertion, credentialToken, grantToken, challengeToken }),
  });
  const result = await verRes.json();
  return {
    verified: result.verified ?? false,
    reason: result.reason,
    attestation: {
      challengeHash: options.challenge ?? '',
      nonce,
      timestamp,
      assertionClientDataJSON: assertion.response.clientDataJSON,
    },
  };
}
