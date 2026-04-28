// Layer 3: Transform Drift Detector using embedding cosine similarity.
// Uses @xenova/transformers running in Node.js WASM — no external API call.
// Falls back to length heuristics if model load fails.

import type { TransformType } from './agentAttestation';

// Lazy-loaded pipeline
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pipeline: ((sentences: string[]) => Promise<any[]>) | null = null;

async function getEmbedder() {
  if (pipeline) return pipeline;
  try {
    const { pipeline: createPipeline } = await import('@xenova/transformers');
    const model = await createPipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      quantized: true,
    });
    pipeline = async (sentences: string[]) => {
      const results = [];
      for (const s of sentences) {
        const out = await model(s, { pooling: 'mean', normalize: true });
        results.push(out);
      }
      return results;
    };
    return pipeline;
  } catch {
    return null;
  }
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface DriftResult {
  valid: boolean;
  transformType: TransformType;
  reason: string;
  similarity?: number;
}

export async function verifyTransform(
  received: string,
  forwarded: string,
  transformType: TransformType,
): Promise<DriftResult> {
  switch (transformType) {
    case 'PASSTHROUGH': {
      if (received === forwarded) {
        return { valid: true, transformType, reason: 'Content unchanged (PASSTHROUGH)' };
      }
      return { valid: false, transformType, reason: 'PASSTHROUGH declared but content was modified' };
    }

    case 'EXTRACT': {
      // Every sentence in forwarded must appear verbatim in received
      const fwdSentences = forwarded.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
      const allPresent = fwdSentences.every(s => received.includes(s));
      if (allPresent) {
        return { valid: true, transformType, reason: 'Extracted content is a subset of received' };
      }
      return { valid: false, transformType, reason: 'EXTRACT declared but forwarded content not a subset of received' };
    }

    case 'FILTER': {
      // Forwarded must be shorter and tokens mostly from received
      const recTokens = new Set(received.toLowerCase().split(/\s+/));
      const fwdTokens = forwarded.toLowerCase().split(/\s+/);
      const overlapRatio = fwdTokens.filter(t => recTokens.has(t)).length / fwdTokens.length;
      if (forwarded.length <= received.length && overlapRatio > 0.8) {
        return { valid: true, transformType, reason: `FILTER valid — ${Math.round(overlapRatio * 100)}% token overlap` };
      }
      return { valid: false, transformType, reason: `FILTER invalid — ${Math.round(overlapRatio * 100)}% token overlap (need >80%)` };
    }

    case 'SUMMARIZE':
    case 'QUERY': {
      // Length check for SUMMARIZE
      if (transformType === 'SUMMARIZE' && forwarded.length >= received.length * 0.85) {
        return {
          valid: false,
          transformType,
          reason: `SUMMARIZE declared but forwarded is ${Math.round(forwarded.length / received.length * 100)}% of received length (should be <85%)`,
        };
      }

      // Try embedding similarity
      const embedder = await getEmbedder();
      if (embedder) {
        try {
          const [recEmb, fwdEmb] = await embedder([received.slice(0, 512), forwarded.slice(0, 512)]);
          const sim = cosineSimilarity(new Float32Array(recEmb.data), new Float32Array(fwdEmb.data));
          const threshold = transformType === 'SUMMARIZE' ? 0.55 : 0.4;
          if (sim >= threshold) {
            return { valid: true, transformType, reason: `Semantic similarity ${sim.toFixed(3)} ≥ threshold ${threshold}`, similarity: sim };
          }
          return { valid: false, transformType, reason: `Semantic drift detected — similarity ${sim.toFixed(3)} < threshold ${threshold}`, similarity: sim };
        } catch {
          // Fall through to length-only heuristic
        }
      }

      // Fallback: length heuristic only
      const ratio = forwarded.length / received.length;
      if (transformType === 'SUMMARIZE' && ratio < 0.85) {
        return { valid: true, transformType, reason: 'SUMMARIZE valid by length heuristic (embedding unavailable)' };
      }
      return { valid: true, transformType, reason: `${transformType} assumed valid (embedding unavailable)` };
    }

    default:
      return { valid: false, transformType, reason: `Unknown transform type: ${transformType}` };
  }
}
