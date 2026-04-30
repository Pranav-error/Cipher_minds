// Stateless WebAuthn registration.
// OPTIONS returns a signed challengeToken the client sends back in VERIFY.
// VERIFY returns a signed credentialToken the client stores in localStorage.

import { NextRequest, NextResponse } from 'next/server';
import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server';
import { signToken, verifyToken, type ChallengePayload, type CredentialPayload } from '@/lib/tokenSession';

const RP_NAME = 'ZeroProof';

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
    const { userId, username } = await req.json();

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: rpId,
      userName: username ?? userId,
      userID: new TextEncoder().encode(userId),
      attestationType: 'none',
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'discouraged' },
    });

    const challengeToken = await signToken({
      challenge: options.challenge,
      userId,
      context: 'reg',
      exp: Date.now() + 5 * 60 * 1000,
    } satisfies ChallengePayload);

    return NextResponse.json({ options, challengeToken });
  }

  if (action === 'verify') {
    const { userId, response, challengeToken } = await req.json();

    const payload = await verifyToken<ChallengePayload>(challengeToken);
    if (!payload || payload.context !== 'reg' || payload.userId !== userId) {
      return NextResponse.json({ error: 'Invalid or expired challenge token' }, { status: 400 });
    }

    try {
      const verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: payload.challenge,
        expectedOrigin: origin,
        expectedRPID: rpId,
      });

      if (!verification.verified || !verification.registrationInfo) {
        return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
      }

      const { credential } = verification.registrationInfo;
      const credentialId = credential.id;
      const publicKeyHex = Buffer.from(credential.publicKey).toString('hex');

      const credentialToken = await signToken({
        credentialId,
        publicKeyHex,
        counter: credential.counter,
        userId,
        exp: Date.now() + 24 * 60 * 60 * 1000,
      } satisfies CredentialPayload);

      return NextResponse.json({ verified: true, credentialId, credentialToken });
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 400 });
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}