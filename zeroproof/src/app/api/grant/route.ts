// Layer 0: Stateless Capability Grant.
// Client sends credentialToken; server returns challengeToken (options) and grantToken (after verify).

import { NextRequest, NextResponse } from 'next/server';
import { generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { signToken, verifyToken, type ChallengePayload, type CredentialPayload, type GrantPayload } from '@/lib/tokenSession';
import { grantCanonical, type AgentCapability } from '@/lib/capabilities';
import { randomUUID } from 'crypto';

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
    const { userId, capabilities, credentialToken } = await req.json() as {
      userId: string;
      capabilities: AgentCapability[];
      credentialToken: string;
    };

    const cred = await verifyToken<CredentialPayload>(credentialToken);
    if (!cred || cred.userId !== userId) {
      return NextResponse.json({ error: 'Invalid credential token — re-register' }, { status: 401 });
    }

    const sessionId = randomUUID();
    const issuedAt = Date.now();
    const expiresAt = issuedAt + 2 * 60 * 60 * 1000;

    const proposedGrant = { sessionId, granted: capabilities, issuedAt, expiresAt };
    const grantJson = grantCanonical(proposedGrant);

    const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(grantJson));
    const challenge = isoBase64URL.fromBuffer(new Uint8Array(hashBuf));

    const options = await generateAuthenticationOptions({
      rpID: rpId,
      challenge,
      allowCredentials: [{ id: cred.credentialId }],
      userVerification: 'preferred',
    });

    const challengeToken = await signToken({
      challenge: options.challenge,
      userId,
      context: 'grant',
      extra: grantJson,
      exp: Date.now() + 5 * 60 * 1000,
    } satisfies ChallengePayload);

    return NextResponse.json({ options, sessionId, challengeToken });
  }

  if (action === 'verify') {
    const { userId, response, credentialToken, challengeToken } = await req.json();

    const cred = await verifyToken<CredentialPayload>(credentialToken);
    if (!cred || cred.userId !== userId) {
      return NextResponse.json({ error: 'Invalid credential token' }, { status: 401 });
    }

    const challengePayload = await verifyToken<ChallengePayload>(challengeToken);
    if (!challengePayload || challengePayload.context !== 'grant' || challengePayload.userId !== userId) {
      return NextResponse.json({ error: 'Invalid or expired challenge token' }, { status: 400 });
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
        return NextResponse.json({ error: 'Assertion failed' }, { status: 400 });
      }

      const grant = JSON.parse(challengePayload.extra!);

      // Sign the grant into a token the client stores in localStorage
      const grantToken = await signToken({
        sessionId: grant.sessionId,
        granted: grant.granted,
        issuedAt: grant.issuedAt,
        expiresAt: grant.expiresAt,
      } satisfies GrantPayload);

      return NextResponse.json({ verified: true, sessionId: grant.sessionId, grant, grantToken });
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 400 });
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
