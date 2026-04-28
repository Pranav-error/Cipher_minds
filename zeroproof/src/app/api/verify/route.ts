// Layer 1: Prompt Integrity Check
// POST /api/verify/options  → get WebAuthn challenge bound to prompt
// POST /api/verify/assert   → verify assertion, burn nonce

import { NextRequest, NextResponse } from 'next/server';
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import {
  getCredentialByUser,
  saveChallenge,
  consumeChallenge,
  updateCounter,
  getGrant,
} from '@/lib/sessionStore';
import { consumeNonce } from '@/lib/nonceStore';

const RP_ID = process.env.RP_ID ?? 'localhost';
const ORIGIN = process.env.NEXT_PUBLIC_ORIGIN ?? 'http://localhost:3000';
const TIMESTAMP_TOLERANCE_MS = 30_000; // 30 seconds

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const action = url.searchParams.get('action') ?? 'options';

  if (action === 'options') {
    const { userId, prompt, sessionId, nonce, timestamp } = await req.json();

    const cred = getCredentialByUser(userId);
    if (!cred) {
      return NextResponse.json({ error: 'User not registered' }, { status: 404 });
    }

    const grant = getGrant(sessionId);
    if (!grant) {
      return NextResponse.json({ error: 'Session grant not found or expired' }, { status: 404 });
    }

    // Build challenge = SHA256(prompt|sessionId|nonce|timestamp)
    const raw = `${prompt}|${sessionId}|${nonce}|${timestamp}`;
    const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    const challenge = isoBase64URL.fromBuffer(hashBuf);

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      challenge,
      allowCredentials: [{ id: cred.credentialId }],
      userVerification: 'preferred',
    });

    const key = `prompt:${nonce}`;
    saveChallenge(key, options.challenge);
    // Store prompt data for verification
    saveChallenge(`prompt-data:${nonce}`, JSON.stringify({ prompt, sessionId, nonce, timestamp, userId }));

    return NextResponse.json({ options });
  }

  if (action === 'assert') {
    const { nonce, response } = await req.json();

    const expectedChallenge = consumeChallenge(`prompt:${nonce}`);
    const rawData = consumeChallenge(`prompt-data:${nonce}`);
    if (!expectedChallenge || !rawData) {
      return NextResponse.json({ error: 'Challenge expired or not found' }, { status: 400 });
    }

    const { prompt, sessionId, timestamp, userId } = JSON.parse(rawData);

    // Timestamp freshness check
    if (Math.abs(Date.now() - timestamp) > TIMESTAMP_TOLERANCE_MS) {
      return NextResponse.json({
        verified: false,
        layer: 1,
        reason: 'Timestamp outside valid window (possible replay)',
      }, { status: 400 });
    }

    // Nonce single-use check
    if (!consumeNonce(nonce)) {
      return NextResponse.json({
        verified: false,
        layer: 1,
        reason: 'Nonce already consumed (replay attack detected)',
      }, { status: 400 });
    }

    const cred = getCredentialByUser(userId);
    if (!cred) {
      return NextResponse.json({ error: 'User not registered' }, { status: 404 });
    }

    try {
      const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        credential: {
          id: cred.credentialId,
          publicKey: cred.publicKey,
          counter: cred.counter,
        },
      });

      if (!verification.verified) {
        return NextResponse.json({
          verified: false,
          layer: 1,
          reason: 'WebAuthn assertion failed — prompt may have been tampered with in transit',
        }, { status: 400 });
      }

      updateCounter(cred.credentialId, verification.authenticationInfo.newCounter);

      return NextResponse.json({
        verified: true,
        layer: 1,
        prompt,
        sessionId,
        timestamp,
      });
    } catch (err) {
      return NextResponse.json({
        verified: false,
        layer: 1,
        reason: `Verification error: ${String(err)}`,
      }, { status: 400 });
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
