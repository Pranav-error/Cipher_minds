// Agent attestation chain using Ed25519.
// Each agent signs: { receivedHash, transformType, forwardedHash, agentId, parentSigHash, timestamp }
// The chain links back to the human's WebAuthn-signed prompt (Layer 1).

import * as ed from '@noble/ed25519';

export type TransformType = 'PASSTHROUGH' | 'SUMMARIZE' | 'EXTRACT' | 'FILTER' | 'QUERY';

export interface AttestationLink {
  agentId: string;
  transformType: TransformType;
  capabilityUsed: string;
  receivedHash: string;    // hex SHA-256 of content received
  forwardedHash: string;   // hex SHA-256 of content forwarded
  parentSigHash: string;   // hex SHA-256 of parent link's signature (or 'ORIGIN' for first link)
  timestamp: number;
  signature: string;       // hex Ed25519 signature over canonical JSON of above fields
  tainted: boolean;        // whether any content in this link came from external/untrusted source
  taintSource?: string;
}

export interface AgentKeypair {
  agentId: string;
  privateKey: Uint8Array;  // 32 bytes
  publicKey: Uint8Array;   // 32 bytes
}

export interface RegisteredAgent {
  agentId: string;
  publicKey: Uint8Array;
  allowedCapabilities: string[];
  allowedTransforms: TransformType[];
}

// In-memory agent registry (server-side)
const agentRegistry = new Map<string, RegisteredAgent>();

export function registerAgent(agent: RegisteredAgent) {
  agentRegistry.set(agent.agentId, agent);
}

export function getAgent(agentId: string): RegisteredAgent | undefined {
  return agentRegistry.get(agentId);
}

// Generate a new keypair for an agent
export async function generateAgentKeypair(agentId: string): Promise<AgentKeypair> {
  const privKey = ed.utils.randomSecretKey();
  const pubKey = await ed.getPublicKeyAsync(privKey);
  return { agentId, privateKey: privKey, publicKey: pubKey };
}

// Compute SHA-256 of a string, return hex
async function sha256hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Canonical payload for signing (excludes signature field)
function linkPayload(link: Omit<AttestationLink, 'signature'>): string {
  return JSON.stringify({
    agentId: link.agentId,
    transformType: link.transformType,
    capabilityUsed: link.capabilityUsed,
    receivedHash: link.receivedHash,
    forwardedHash: link.forwardedHash,
    parentSigHash: link.parentSigHash,
    timestamp: link.timestamp,
    tainted: link.tainted,
    taintSource: link.taintSource ?? null,
  });
}

// Sign an attestation link
export async function signLink(
  privKey: Uint8Array,
  link: Omit<AttestationLink, 'signature'>,
): Promise<AttestationLink> {
  const payload = new TextEncoder().encode(linkPayload(link));
  const sig = await ed.signAsync(payload, privKey);
  return { ...link, signature: Buffer.from(sig).toString('hex') };
}

// Verify a single attestation link
export async function verifyLink(link: AttestationLink): Promise<boolean> {
  const agent = getAgent(link.agentId);
  if (!agent) return false;

  const payload = new TextEncoder().encode(linkPayload({
    agentId: link.agentId,
    transformType: link.transformType,
    capabilityUsed: link.capabilityUsed,
    receivedHash: link.receivedHash,
    forwardedHash: link.forwardedHash,
    parentSigHash: link.parentSigHash,
    timestamp: link.timestamp,
    tainted: link.tainted,
    taintSource: link.taintSource,
  }));

  try {
    const sigBytes = Buffer.from(link.signature, 'hex');
    return await ed.verifyAsync(sigBytes, payload, agent.publicKey);
  } catch {
    return false;
  }
}

// Verify the full chain and check capability grants
export interface ChainVerifyResult {
  valid: boolean;
  failedAt?: string;
  reason?: string;
  links: Array<{ agentId: string; valid: boolean; capabilityGranted: boolean }>;
}

export async function verifyChain(
  chain: AttestationLink[],
  grantedCapabilities: string[],
): Promise<ChainVerifyResult> {
  const results: ChainVerifyResult['links'] = [];

  for (let i = 0; i < chain.length; i++) {
    const link = chain[i];

    // 1. Signature valid?
    const sigValid = await verifyLink(link);
    if (!sigValid) {
      return {
        valid: false,
        failedAt: link.agentId,
        reason: `Signature invalid at agent ${link.agentId}`,
        links: [...results, { agentId: link.agentId, valid: false, capabilityGranted: false }],
      };
    }

    // 2. Capability granted?
    const capGranted = grantedCapabilities.includes(link.capabilityUsed);
    if (!capGranted) {
      return {
        valid: false,
        failedAt: link.agentId,
        reason: `Capability '${link.capabilityUsed}' not in user's capability grant`,
        links: [...results, { agentId: link.agentId, valid: true, capabilityGranted: false }],
      };
    }

    // 3. Agent is in registry?
    const agent = getAgent(link.agentId);
    if (!agent) {
      return {
        valid: false,
        failedAt: link.agentId,
        reason: `Agent '${link.agentId}' not in authorized registry`,
        links: [...results, { agentId: link.agentId, valid: true, capabilityGranted: true }],
      };
    }

    // 4. Capability is in agent's allowed set?
    if (!agent.allowedCapabilities.includes(link.capabilityUsed)) {
      return {
        valid: false,
        failedAt: link.agentId,
        reason: `Agent '${link.agentId}' not authorized for capability '${link.capabilityUsed}'`,
        links: [...results, { agentId: link.agentId, valid: true, capabilityGranted: false }],
      };
    }

    // 5. Parent signature hash chain integrity
    if (i === 0) {
      // First link: parentSigHash should be 'ORIGIN' or hash of Layer 1 assertion
      // For demo: accept 'ORIGIN'
      if (link.parentSigHash !== 'ORIGIN' && link.parentSigHash.length !== 64) {
        return {
          valid: false,
          failedAt: link.agentId,
          reason: 'Chain origin not properly anchored to Layer 1',
          links: [...results, { agentId: link.agentId, valid: false, capabilityGranted: true }],
        };
      }
    } else {
      const prevSig = chain[i - 1].signature;
      const expectedParentHash = await sha256hex(prevSig);
      if (link.parentSigHash !== expectedParentHash) {
        return {
          valid: false,
          failedAt: link.agentId,
          reason: `Chain break at agent ${link.agentId} — parentSigHash mismatch`,
          links: [...results, { agentId: link.agentId, valid: false, capabilityGranted: true }],
        };
      }
    }

    results.push({ agentId: link.agentId, valid: true, capabilityGranted: true });
  }

  return { valid: true, links: results };
}

export async function hashContent(content: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
