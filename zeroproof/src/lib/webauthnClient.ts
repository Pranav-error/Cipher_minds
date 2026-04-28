'use client';

import {
  startRegistration,
  startAuthentication,
} from '@simplewebauthn/browser';
import type { AgentCapability } from './capabilities';

export async function registerUser(userId: string): Promise<{ credentialId: string }> {
  // Get options from server
  const optRes = await fetch('/api/register?action=options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, username: `user-${userId.slice(0, 6)}` }),
  });
  const options = await optRes.json();

  // Perform WebAuthn registration (triggers Touch ID / fingerprint)
  const regResponse = await startRegistration({ optionsJSON: options });

  // Verify on server
  const verRes = await fetch('/api/register?action=verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, response: regResponse }),
  });
  const result = await verRes.json();
  if (!result.verified) throw new Error('Registration failed');
  return { credentialId: result.credentialId };
}

export async function grantCapabilities(
  userId: string,
  capabilities: AgentCapability[],
): Promise<{ sessionId: string }> {
  // Get options (server builds proposed grant, hashes it as challenge)
  const optRes = await fetch('/api/grant?action=options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, capabilities }),
  });
  const { options, sessionId } = await optRes.json();

  // WebAuthn assertion — user signs the capability grant hash
  const assertion = await startAuthentication({ optionsJSON: options });

  // Verify on server
  const verRes = await fetch('/api/grant?action=verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, userId, response: assertion }),
  });
  const result = await verRes.json();
  if (!result.verified) throw new Error('Capability grant signing failed');
  return { sessionId };
}

export async function signAndVerifyPrompt(
  userId: string,
  prompt: string,
  sessionId: string,
): Promise<{ verified: boolean; reason?: string }> {
  const nonce = crypto.randomUUID();
  const timestamp = Date.now();

  // Get options — server builds SHA256(prompt|sessionId|nonce|timestamp) as challenge
  const optRes = await fetch('/api/verify?action=options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, prompt, sessionId, nonce, timestamp }),
  });
  const { options } = await optRes.json();

  // WebAuthn assertion — hardware key signs the challenge
  const assertion = await startAuthentication({ optionsJSON: options });

  // Verify on server
  const verRes = await fetch('/api/verify?action=assert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nonce, response: assertion }),
  });

  const result = await verRes.json();
  return { verified: result.verified ?? false, reason: result.reason };
}
