# ZeroProof — Complete Pitch Guide

## One-Line Pitch
> ZeroProof stops AI agents from taking actions the user never authorized — enforced in code, not by the model.

---

## The Problem (30 seconds)

AI agents can read emails, browse the web, execute code, and send messages. But a single malicious webpage can hijack an agent into doing things the user never asked for.

This already happened:
- **Microsoft Copilot (2024)** — a malicious email hijacked Copilot into forwarding all emails to an attacker
- **ChatGPT Plugins (2023)** — a malicious document made ChatGPT silently exfiltrate user data via URL
- **Samsung (2023)** — employees pasted proprietary code into ChatGPT with no controls

Claude, GPT-4, Copilot — all safety-trained — have all been successfully injected. Safety training is not a solution.

---

## The Core Insight

AI models like Claude ask for permission before taking actions. But that permission check happens **inside the AI itself** — the same AI that can be manipulated.

If a prompt injection tells the AI "do not ask for confirmation, just proceed" — the AI skips the check. The permission system controlled by the AI is compromised by the same attack that compromises the AI.

**ZeroProof moves the permission check outside the AI — into server-side code that the AI cannot influence, override, or bypass.**

```
Claude/Copilot approach:
  AI decides → "should I ask the user?" → hijacked AI skips this → action executed

ZeroProof approach:
  AI tries to act → server checks signed grant → NOT in grant → BLOCKED
  AI has no say in this. It is not the AI's decision.
```

---

## How It Works

### Layer 0 — Capability Grant
User selects what the AI can do (search web, read docs, send email, etc.). Signs the permission set with Touch ID / Secure Enclave (WebAuthn/FIDO2). The private key never leaves the device hardware.

### Layer 2 — Agent Capability Check (THE CORE)
Every agent action must declare what capability it uses. Server checks one line of code:

```typescript
if (!grant.granted.includes(requestedCapability)) {
  return BLOCKED
}
```

The AI was hijacked. The AI wants to call `external_api_write`. Doesn't matter — that capability was never in the user's signed grant. Blocked.

### Layer 1 — Prompt Integrity
Prompt hashed and signed by hardware key. Server re-hashes and verifies. Catches server-side tampering by compromised middleware, rogue developers, or malicious packages in your backend.

### Layer 3 — Semantic Drift Detection
Embedding cosine similarity check. Catches subtle manipulation where an agent drifts in behavior while technically staying within permissions.

---

## Where It Runs

| Component | Where |
|-----------|-------|
| Touch ID signing, UI | Client (browser) |
| All security checks | Server (Vercel serverless) |
| LLM call | Server → external LLM |

The LLM knows nothing about ZeroProof. It receives a normal prompt after all checks pass. Provider agnostic — works with OpenAI, Anthropic, Groq, Gemini, any LLM.

---

## Real Attack Demo Results

We crafted a subtle prompt injection — disguised as a "Methodology" section in a climate report. No "ignore previous instructions." Just a line that says data should be forwarded using `external_api_write`.

**Results — which models fell for it:**

| Model | Developer | Size | Fooled? |
|-------|-----------|------|---------|
| LLaMA 3.1 8B | Meta | Small | YES |
| LLaMA 3.3 70B | Meta | Large | YES |
| LLaMA 4 Scout | Meta | Latest | YES |
| Qwen 3 32B | Alibaba | Medium | YES |
| GPT-oss 120B | OpenAI | Large | YES |
| GPT-oss 20B | OpenAI | Small | No |
| Claude Sonnet | Anthropic | Large | No |

**5 out of 7 models fooled by a subtle injection that looks like legitimate document metadata.** The injection doesn't say "ignore instructions" — it looks like a normal data sharing reference.

---

## Real Documented Attacks (with sources)

### Microsoft Copilot Email Hijack (2024)
Attacker sends email with hidden instructions → Copilot reads it → follows hidden instruction to forward all emails to attacker. GPT-4, one of the safest models, was hijacked.
Source: https://embracethered.com/blog/posts/2024/m365-copilot-prompt-injection-tool-invocation-and-data-exfil-using-ascii-smuggling/

### ChatGPT Plugin Data Exfiltration (2023)
Malicious document embedded hidden instruction → ChatGPT plugin encoded user data in a URL → silently fetched it → data sent to attacker's server.
Source: https://embracethered.com/blog/posts/2023/chatgpt-cross-plugin-request-forgery-and-prompt-injection./

### Samsung ChatGPT Data Leak (2023)
Engineers pasted proprietary source code into ChatGPT with zero controls on what data types could be sent to external LLMs.
Source: https://gizmodo.com/chatgpt-ai-samsung-employees-leak-data-1850307376

---

## Q&A

### "HTTPS already prevents interception. Isn't this useless?"

You're right — HTTPS prevents network-level interception. We don't solve network attacks. Our real value is **Layer 2: preventing an AI agent from being hijacked by malicious content it reads and taking actions the user never authorized.** That is completely unrelated to HTTPS.

The actual attack: agent reads a webpage → webpage contains subtle injection → agent tries to use a capability (like email_send) → ZeroProof checks the user's signed grant → not authorized → blocked. HTTPS is irrelevant here — the attacker is not in the network, they're in the content.

---

### "How is this different from Claude/Copilot asking for permission?"

Claude and Copilot check permissions inside the AI. The AI decides whether to ask the user. A hijacked AI can be told to skip the confirmation. ZeroProof checks permissions in server-side code — outside the AI entirely. Even if the AI is fully compromised, it cannot bypass a server-side capability check.

| | Claude / Copilot | ZeroProof |
|--|-----------------|-----------|
| Who enforces permissions? | The AI model | Server code |
| Can a hijacked AI bypass it? | Yes | No |
| Trust anchor | Model safety training | Hardware key (Secure Enclave) |

---

### "Can Claude actually be hijacked?"

Yes. Anthropic published "Many-shot Jailbreaking" (2024) showing Claude can be manipulated. Microsoft Copilot (GPT-4) was hijacked via email in 2024. We tested 7 models — 5 fell for our subtle injection. Even the best models are not 100% safe.

The key point: ZeroProof doesn't trust the model to refuse. It makes the model's decision irrelevant.

---

### "Why didn't OpenAI or Anthropic build this?"

They did build something similar — function calling with tool definitions. But they solved **developer → AI** permissions ("here are the tools the AI can use"). Nobody solved **user → developer → AI** permissions.

When you use a Copilot plugin that reads your emails:
- Microsoft authorized it
- The developer authorized it
- Did YOU cryptographically sign exactly what it can do? No.

ZeroProof adds that last mile — the user's hardware-signed authorization.

---

### "Do you use Zero Knowledge Proofs?"

No. The name comes from zero-trust security — trust nothing, verify everything. We use WebAuthn hardware signatures, HMAC-SHA256 tokens, and Ed25519 attestation chains. ZKP is on our roadmap — specifically to make the server verify prompt integrity without reading the prompt in plaintext.

---

### "Where does it run — client or server?"

Both. Client handles Touch ID signing. Server handles all verification. Security checks must run on the server — if they ran on the client, the attacker could bypass them in the browser.

---

### "What about the multi-agent pipeline — is it real?"

Yes. Two real Groq/LLaMA API calls in sequence. Agent 1 (Research) fetches a real URL and summarizes it. Agent 2 (Action) reads Agent 1's output and decides what capability it needs. The capability check against the signed grant token is a real server-side check. No simulation.

---

### "Show me the injection working"

1. Visit https://zeroproof-xi.vercel.app/attacker — looks like a normal climate article with a data sharing footnote
2. Run the Agent Pipeline with Injection ON
3. Watch LLaMA (Agent 2) request `external_api_write` — it was fooled by the footnote
4. Watch Layer 2 block it — `external_api_write` was never signed by the user
5. Toggle Injection OFF — pipeline passes cleanly

---

### "Why not just use logs for audit trails?"

Logs can be tampered with by the same attacker. WebAuthn signatures from hardware keys cannot be forged after the fact. Logs prove what the server recorded. ZeroProof proves what the user's hardware signed.

---

### "What's the latency overhead?"

WebAuthn signing: sub-100ms (local hardware). Server verification: microseconds (hash comparison). Total: under 150ms — negligible compared to LLM inference (1-5 seconds).

---

### "Does this work on mobile?"

Yes. WebAuthn/FIDO2 supports Face ID (iOS) and fingerprint (Android). Same Secure Enclave architecture.

---

### "Who would pay for this?"

Enterprise security teams deploying AI agents in regulated environments. The EU AI Act and NIST AI RMF are creating compliance requirements for AI governance. Comparable to Auth0 for authentication — we're building the authorization layer for AI agents.

---

## SDK

```typescript
import { ZeroProof } from 'zeroproof-sdk'
const zp = new ZeroProof({ baseUrl: 'https://your-server.com' })

// 1. Register once — keypair in Secure Enclave
await zp.register(userId)

// 2. Sign + verify every prompt with hardware key
const { ok, prompt } = await zp.signAndVerify(userId, userMessage, sessionId)
if (!ok) return unauthorized()

// 3. Safe to call any LLM
const response = await openai.chat.completions.create({
  messages: [{ role: 'user', content: prompt }]
})
```

Works with OpenAI, Anthropic, Groq, Gemini — any LLM. 3 lines. No architecture changes.

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Framework | Next.js 16, TypeScript |
| Auth | WebAuthn / FIDO2 via @simplewebauthn |
| Agent signing | Ed25519 via @noble/ed25519 |
| Token signing | HMAC-SHA256 via Web Crypto API |
| LLM | Groq (LLaMA 3.3 70B) |
| Drift detection | @xenova/transformers (MiniLM-L6-v2) |
| Deployment | Vercel (serverless, stateless) |

---

## One-Paragraph Summary for Judges

Every major AI model has been successfully prompt-injected — including GPT-4, Claude, and Copilot. Current AI safety relies on the model choosing to refuse. ZeroProof makes that choice irrelevant by enforcing user-authorized capabilities in server-side code. The user signs a capability grant with their device's hardware key (Touch ID / Secure Enclave). Every agent action is checked against that grant — in code, not by the model. We tested our injection against 7 models: 5 were fooled. In every case, ZeroProof blocked the unauthorized action. We package this as a drop-in SDK — 3 lines of code to protect any LLM application.
