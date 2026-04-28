// Server-side in-memory store for WebAuthn credentials and capability grants.

import type { CapabilityGrant } from './capabilities';

export interface StoredCredential {
  credentialId: string;       // base64url
  publicKey: Uint8Array;      // COSE-encoded public key bytes
  counter: number;
  userId: string;
  createdAt: number;
}

const credentials = new Map<string, StoredCredential>(); // credentialId → credential
const userCredentials = new Map<string, string>();        // userId → credentialId
const grants = new Map<string, CapabilityGrant>();        // sessionId → grant
const challenges = new Map<string, string>();             // challengeKey → base64url challenge

// --- Credentials ---

export function saveCredential(cred: StoredCredential) {
  credentials.set(cred.credentialId, cred);
  userCredentials.set(cred.userId, cred.credentialId);
}

export function getCredential(credentialId: string): StoredCredential | undefined {
  return credentials.get(credentialId);
}

export function getCredentialByUser(userId: string): StoredCredential | undefined {
  const id = userCredentials.get(userId);
  if (!id) return undefined;
  return credentials.get(id);
}

export function updateCounter(credentialId: string, counter: number) {
  const cred = credentials.get(credentialId);
  if (cred) cred.counter = counter;
}

// --- Challenges (temporary, TTL 5 min) ---

export function saveChallenge(key: string, challenge: string) {
  challenges.set(key, challenge);
  setTimeout(() => challenges.delete(key), 300_000);
}

export function consumeChallenge(key: string): string | undefined {
  const c = challenges.get(key);
  if (c) challenges.delete(key);
  return c;
}

// --- Capability Grants ---

export function saveGrant(grant: CapabilityGrant) {
  grants.set(grant.sessionId, grant);
}

export function getGrant(sessionId: string): CapabilityGrant | undefined {
  const g = grants.get(sessionId);
  if (!g) return undefined;
  if (g.expiresAt < Date.now()) {
    grants.delete(sessionId);
    return undefined;
  }
  return g;
}
