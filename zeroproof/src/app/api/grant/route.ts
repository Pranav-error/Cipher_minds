// Layer 0: Capability Grant endpoint.
// POST /api/grant/options  → generate WebAuthn authentication options for signing the grant
// POST /api/grant/verify   → verify WebAuthn assertion and store capability grant

import { NextRequest, NextResponse } from 'next/server';
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import {
  getCredential,
  getCredentialByUser,
  saveChallenge,
  consumeChallenge,
  saveGrant,
  updateCounter,
} from '@/lib/sessionStore';
import { grantCanonical, type AgentCapability } from '@/lib/capabilities';
import { randomUUID } from 'crypto';

const RP_ID = process.env.RP_ID ?? 'localhost';
const ORIGIN = process.env.NEXT_PUBLIC_ORIGIN ?? 'http://localhost:3000';

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const action = url.searchParams.get('action') ?? 'options';

  if (action === 'options') {
    const { userId, capabilities } = await req.json() as {
      userId: string;
      capabilities: AgentCapability[];
    };

    const cred = getCredentialByUser(userId);
    if (!cred) {
      return NextResponse.json({ error: 'User not registered' }, { status: 404 });
    }

    // Build the proposed grant (without assertion yet) so we can hash it as challenge
    const sessionId = randomUUID();
    const issuedAt = Date.now();
    const expiresAt = issuedAt + 2 * 60 * 60 * 1000; // 2 hours

    const proposedGrant = { sessionId, granted: capabilities, issuedAt, expiresAt };
    const grantJson = grantCanonical(proposedGrant);

    // SHA-256 of grantJson as the WebAuthn challenge
    const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(grantJson));
    const challenge = isoBase64URL.fromBuffer(hashBuf);

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      challenge,
      allowCredentials: [{ id: cred.credentialId }],
      userVerification: 'preferred',
    });

    saveChallenge(`grant:${sessionId}`, options.challenge);
    // Temporarily store proposed grant data so verify can reconstruct
    saveChallenge(`grant-data:${sessionId}`, grantJson);

    return NextResponse.json({ options, sessionId });
  }

  if (action === 'verify') {
    const { sessionId, userId, response } = await req.json();

    const expectedChallenge = consumeChallenge(`grant:${sessionId}`);
    const grantJson = consumeChallenge(`grant-data:${sessionId}`);
    if (!expectedChallenge || !grantJson) {
      return NextResponse.json({ error: 'No challenge found' }, { status: 400 });
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
        return NextResponse.json({ error: 'Assertion failed' }, { status: 400 });
      }

      updateCounter(cred.credentialId, verification.authenticationInfo.newCounter);

      const grant = JSON.parse(grantJson);
      grant.webauthnAssertion = JSON.stringify(response);
      saveGrant(grant);

      return NextResponse.json({ verified: true, sessionId, grant });
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 400 });
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
