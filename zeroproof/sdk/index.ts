/**
 * ZeroProof SDK
 * Drop-in cryptographic security layer for LLM applications.
 *
 * Usage:
 *   import { ZeroProof } from 'zeroproof-sdk'
 *   const zp = new ZeroProof({ baseUrl: 'https://your-zeroproof-server.com' })
 *   const { signedPrompt, token } = await zp.sign(prompt, grantToken)
 *   const verified = await zp.verify(signedPrompt, token)
 *   const response = await yourLLM.chat(verified.prompt)
 */

export interface ZeroProofConfig {
  /** Base URL of your ZeroProof server (e.g. https://zeroproof-xi.vercel.app) */
  baseUrl: string;
  /** Optional timeout in ms for verification requests (default: 5000) */
  timeoutMs?: number;
}


export interface VerifyResult {
  /** Whether the proof is valid and the prompt is untampered */
  ok: boolean;
  /** The verified prompt — safe to send to your LLM */
  prompt: string;
  /** Why verification failed (only present when ok=false) */
  reason?: string;
  /** Which security layer caught the issue */
  failedLayer?: 0 | 1 | 2 | 3;
  /** Capabilities granted for this session */
  grantedCapabilities?: string[];
}

export interface CapabilityGrant {
  sessionId: string;
  granted: string[];
  token: string;
  expiresAt: number;
}

export class ZeroProof {
  private baseUrl: string;
  private timeoutMs: number;

  constructor(config: ZeroProofConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.timeoutMs = config.timeoutMs ?? 5000;
  }

  /**
   * Register a user's device via WebAuthn (Touch ID / Face ID).
   * Call this once per user — stores keypair in device Secure Enclave.
   */
  async register(userId: string): Promise<{ credentialToken: string }> {
    const { registerUser } = await import('../src/lib/webauthnClient');
    const credentialToken = await registerUser(userId);
    return { credentialToken: credentialToken as unknown as string };
  }

  /**
   * Grant capabilities for a session.
   * User signs the exact capability set with their hardware key.
   * Returns a grantToken to use with sign() and verify().
   */
  async grant(
    userId: string,
    capabilities: string[],
    credentialToken: string,
  ): Promise<CapabilityGrant> {
    const res = await this._fetch('/api/grant', {
      method: 'POST',
      body: JSON.stringify({ userId, capabilities, credentialToken }),
    });
    return res as unknown as CapabilityGrant;
  }

  /**
   * Sign + verify a prompt via hardware key (Touch ID / Face ID).
   * Hashes prompt + sessionId + nonce, signs with Secure Enclave,
   * verifies on server — all in one call.
   *
   * @example
   * const { ok, prompt: verifiedPrompt } = await zp.signAndVerify(
   *   userId, userMessage, sessionId
   * )
   * if (!ok) return unauthorized()
   * const response = await openai.chat.completions.create({
   *   messages: [{ role: 'user', content: verifiedPrompt }]
   * })
   */
  async signAndVerify(userId: string, prompt: string, sessionId: string): Promise<VerifyResult> {
    const { signAndVerifyPrompt } = await import('../src/lib/webauthnClient');
    const result = await signAndVerifyPrompt(userId, prompt, sessionId);
    return {
      ok: result.verified,
      prompt,
      reason: result.reason,
    };
  }

  /**
   * Low-level: verify a prompt + proof token on your backend.
   * Use signAndVerify() for the full flow. Use this if you're
   * handling signing separately (e.g. mobile clients).
   */
  async verify(prompt: string, token: string): Promise<VerifyResult> {
    try {
      const res = await this._fetch('/api/verify', {
        method: 'POST',
        body: JSON.stringify({ prompt, proofToken: token }),
      });

      return {
        ok: true,
        prompt: (res.prompt as string | undefined) ?? prompt,
        grantedCapabilities: res.grantedCapabilities as string[] | undefined,
      };
    } catch (err: unknown) {
      const error = err as { status?: number; body?: { reason?: string; layer?: number } };
      return {
        ok: false,
        prompt,
        reason: error?.body?.reason ?? String(err),
        failedLayer: error?.body?.layer as 0 | 1 | 2 | 3 | undefined,
      };
    }
  }

  /**
   * Verify an agent action's capability before executing it.
   * Call this inside each agent before it performs an action.
   *
   * @example
   * const allowed = await zp.checkCapability(grantToken, 'email_send')
   * if (!allowed) throw new Error('Not authorized to send emails')
   * await sendEmail(...)
   */
  async checkCapability(grantToken: string, capability: string): Promise<boolean> {
    try {
      const res = await this._fetch('/api/grant/check', {
        method: 'POST',
        body: JSON.stringify({ grantToken, capability }),
      });
      return res.allowed === true;
    } catch {
      return false;
    }
  }

  private async _fetch(path: string, init: RequestInit): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      });
      const body = await res.json();
      if (!res.ok) throw Object.assign(new Error(body?.reason ?? 'ZeroProof error'), { status: res.status, body });
      return body;
    } finally {
      clearTimeout(timer);
    }
  }
}

// Re-export types
export type { AgentCapability } from '../src/lib/capabilities';
