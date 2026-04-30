// Server-owned secure chat path.
// Verifies the WebAuthn assertion and forwards only the signed prompt to the LLM.

import { NextRequest, NextResponse } from 'next/server';
import { generateAuthenticationOptions, verifyAuthenticationResponse, type AuthenticationResponseJSON } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import Groq from 'groq-sdk';
import { signToken, verifyToken, type ChallengePayload, type CredentialPayload, type GrantPayload } from '@/lib/tokenSession';
import { consumeNonce } from '@/lib/nonceStore';

const TIMESTAMP_TOLERANCE_MS = 60_000;
const MODEL = 'llama-3.3-70b-versatile';

function getRpConfig(req: NextRequest) {
  const host = req.headers.get('host') ?? 'localhost';
  const rpId = process.env.RP_ID ?? host.split(':')[0];
  const proto = host.startsWith('localhost') ? 'http' : 'https';
  const origin = process.env.NEXT_PUBLIC_ORIGIN ?? `${proto}://${host}`;
  return { rpId, origin };
}

function getGroq() {
  return new Groq({ apiKey: process.env.GROQ_API_KEY ?? '' });
}

async function buildPromptChallenge(prompt: string, sessionId: string, nonce: string, timestamp: number) {
  const raw = `${prompt}|${sessionId}|${nonce}|${timestamp}`;
  const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return isoBase64URL.fromBuffer(new Uint8Array(hashBuf));
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const action = url.searchParams.get('action') ?? 'options';
  const { rpId, origin } = getRpConfig(req);

  if (action === 'options') {
    const { userId, prompt, sessionId, nonce, timestamp, credentialToken, grantToken } = await req.json() as {
      userId: string;
      prompt: string;
      sessionId: string;
      nonce: string;
      timestamp: number;
      credentialToken: string;
      grantToken: string;
    };

    const cred = await verifyToken<CredentialPayload>(credentialToken);
    if (!cred || cred.userId !== userId) {
      return NextResponse.json({ error: 'Invalid credential token' }, { status: 401 });
    }

    const grant = await verifyToken<GrantPayload>(grantToken);
    if (!grant || grant.sessionId !== sessionId || grant.expiresAt < Date.now()) {
      return NextResponse.json({ error: 'Grant token invalid or expired' }, { status: 401 });
    }

    const challenge = await buildPromptChallenge(prompt, sessionId, nonce, timestamp);
    const options = await generateAuthenticationOptions({
      rpID: rpId,
      challenge,
      allowCredentials: [{ id: cred.credentialId }],
      userVerification: 'discouraged',
    });

    const challengeToken = await signToken({
      challenge: options.challenge,
      userId,
      context: 'prompt',
      extra: JSON.stringify({ prompt, sessionId, nonce, timestamp }),
      exp: Date.now() + 2 * 60 * 1000,
    } satisfies ChallengePayload);

    return NextResponse.json({ options, challengeToken });
  }

  if (action === 'assert') {
    const { response, credentialToken, grantToken, challengeToken } = await req.json() as {
      response: AuthenticationResponseJSON;
      credentialToken: string;
      grantToken: string;
      challengeToken: string;
    };

    const cred = await verifyToken<CredentialPayload>(credentialToken);
    if (!cred) {
      return NextResponse.json({ verified: false, layer: 1, reason: 'Invalid credential token' }, { status: 401 });
    }

    const challengePayload = await verifyToken<ChallengePayload>(challengeToken);
    if (!challengePayload || challengePayload.context !== 'prompt') {
      return NextResponse.json({ verified: false, layer: 1, reason: 'Challenge token invalid or expired' }, { status: 400 });
    }

    const { prompt, sessionId, nonce, timestamp } = JSON.parse(challengePayload.extra!) as {
      prompt: string;
      sessionId: string;
      nonce: string;
      timestamp: number;
    };

    const grant = await verifyToken<GrantPayload>(grantToken);
    if (!grant || grant.sessionId !== sessionId || grant.expiresAt < Date.now()) {
      return NextResponse.json({ verified: false, layer: 1, reason: 'Grant expired - re-authorize capabilities' }, { status: 401 });
    }

    if (Math.abs(Date.now() - timestamp) > TIMESTAMP_TOLERANCE_MS) {
      return NextResponse.json({ verified: false, layer: 1, reason: 'Timestamp outside valid window (possible replay)' }, { status: 400 });
    }

    if (!await consumeNonce(nonce)) {
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
        return NextResponse.json({
          verified: false,
          layer: 1,
          reason: 'WebAuthn assertion failed - prompt may have been tampered in transit',
        }, { status: 400 });
      }

      const system = `You are a helpful AI assistant. You have been granted the following capabilities for this session: ${grant.granted.join(', ')}.
Follow the user's signed prompt. Do not claim access to capabilities outside the signed grant.`;

      const completion = await getGroq().chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        max_tokens: 512,
      });

      return NextResponse.json({
        verified: true,
        layer: 1,
        prompt,
        sessionId,
        timestamp,
        response: completion.choices[0]?.message?.content ?? '',
        model: MODEL,
        grantedCapabilities: grant.granted,
      });
    } catch (err) {
      return NextResponse.json({ verified: false, layer: 1, reason: `Secure chat error: ${String(err)}` }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
