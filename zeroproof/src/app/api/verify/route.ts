// Layer 1: Stateless Prompt Integrity Check.
// All session data flows in signed tokens — no server-side Map needed.

import { NextRequest, NextResponse } from 'next/server';
import { generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { signToken, verifyToken, type ChallengePayload, type CredentialPayload, type GrantPayload } from '@/lib/tokenSession';
import { consumeNonce } from '@/lib/nonceStore';

const TIMESTAMP_TOLERANCE_MS = 60_000; // 60 seconds

function getRpConfig(req: NextRequest) {
  const host = req.headers.get('host') ?? 'localhost';
  const rpId = process.env.RP_ID ?? host.split(':')[0];
  const proto = host.startsWith('localhost') ? 'http' : 'https';
  const origin = process.env.NEXT_PUBLIC_ORIGIN ?? `${proto}://${host}`;
  return { rpId, origin };
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const action = url.searchParams.get('action') ?? 'options';
  const { rpId, origin } = getRpConfig(req);

  if (action === 'options') {
    const { userId, prompt, sessionId, nonce, timestamp, credentialToken, grantToken } = await req.json();

    const cred = await verifyToken<CredentialPayload>(credentialToken);
    if (!cred || cred.userId !== userId) {
      return NextResponse.json({ error: 'Invalid credential token' }, { status: 401 });
    }

    const grant = await verifyToken<GrantPayload>(grantToken);
    if (!grant || grant.sessionId !== sessionId || grant.expiresAt < Date.now()) {
      return NextResponse.json({ error: 'Grant token invalid or expired' }, { status: 401 });
    }

    const raw = `${prompt}|${sessionId}|${nonce}|${timestamp}`;
    const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    const challenge = isoBase64URL.fromBuffer(new Uint8Array(hashBuf));

    const options = await generateAuthenticationOptions({
      rpID: rpId,
      challenge,
      allowCredentials: [{ id: cred.credentialId, transports: ['internal'] }],
      userVerification: 'preferred',
    });

    const promptData = JSON.stringify({ prompt, sessionId, nonce, timestamp, userId });
    const challengeToken = await signToken({
      challenge: options.challenge,
      userId,
      context: 'prompt',
      extra: promptData,
      exp: Date.now() + 2 * 60 * 1000, // 2 min
    } satisfies ChallengePayload);

    return NextResponse.json({ options, challengeToken });
  }

  if (action === 'assert') {
    const { nonce, response, credentialToken, grantToken, challengeToken } = await req.json();

    const cred = await verifyToken<CredentialPayload>(credentialToken);
    if (!cred) {
      return NextResponse.json({ verified: false, layer: 1, reason: 'Invalid credential token' }, { status: 401 });
    }

    const challengePayload = await verifyToken<ChallengePayload>(challengeToken);
    if (!challengePayload || challengePayload.context !== 'prompt') {
      return NextResponse.json({ verified: false, layer: 1, reason: 'Challenge token invalid or expired' }, { status: 400 });
    }

    const { prompt, sessionId, timestamp, userId } = JSON.parse(challengePayload.extra!);

    const grant = await verifyToken<GrantPayload>(grantToken);
    if (!grant || grant.sessionId !== sessionId || grant.expiresAt < Date.now()) {
      return NextResponse.json({ verified: false, layer: 1, reason: 'Grant expired — re-authorize capabilities' }, { status: 401 });
    }

    if (Math.abs(Date.now() - timestamp) > TIMESTAMP_TOLERANCE_MS) {
      return NextResponse.json({ verified: false, layer: 1, reason: 'Timestamp outside valid window (possible replay)' }, { status: 400 });
    }

    if (!consumeNonce(nonce)) {
      return NextResponse.json({ verified: false, layer: 1, reason: 'Nonce already consumed (replay attack detected)' }, { status: 400 });
    }

    try {
      const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challengePayload.challenge,
        expectedOrigin: origin,
        expectedRPID: rpId,
        credential: {
          id: cred.credentialId,
          publicKey: Buffer.from(cred.publicKeyHex, 'hex'),
          counter: cred.counter,
        },
      });

      if (!verification.verified) {
        return NextResponse.json({ verified: false, layer: 1, reason: 'WebAuthn assertion failed — prompt may have been tampered with in transit' }, { status: 400 });
      }

      return NextResponse.json({ verified: true, layer: 1, prompt, sessionId, timestamp });
    } catch (err) {
      return NextResponse.json({ verified: false, layer: 1, reason: `Verification error: ${String(err)}` }, { status: 400 });
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
