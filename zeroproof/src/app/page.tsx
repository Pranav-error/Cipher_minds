'use client';

import { useState } from 'react';
import { Shield, Fingerprint, CheckCircle2, AlertTriangle, Code2, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CapabilityGranter } from '@/components/CapabilityGranter';
import { ZeroProofChat } from '@/components/ZeroProofChat';
import { AgentPipelineDemo } from '@/components/AgentPipelineDemo';
import { ThreatLog, type ThreatEvent } from '@/components/ThreatLog';
import { cn } from '@/lib/utils';
import type { AgentCapability } from '@/lib/capabilities';

type AppState = 'register' | 'grant' | 'demo';

export default function Home() {
  const [appState, setAppState] = useState<AppState>('register');
  const [userId] = useState(() => crypto.randomUUID());
  const [sessionId, setSessionId] = useState('');
  const [grantToken, setGrantToken] = useState('');
  const [grantedCaps, setGrantedCaps] = useState<AgentCapability[]>([]);
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState('');
  const [registered, setRegistered] = useState(false);
  const [threatEvents, setThreatEvents] = useState<ThreatEvent[]>([]);

  function addThreatEvent(event: ThreatEvent) {
    setThreatEvents(prev => [...prev, event]);
  }

  async function doRegister() {
    setRegistering(true);
    setRegisterError('');
    try {
      const { registerUser } = await import('@/lib/webauthnClient');
      await registerUser(userId);
      setRegistered(true);
      setAppState('grant');
    } catch (err) {
      setRegisterError(String(err));
    } finally {
      setRegistering(false);
    }
  }

  function onGranted(sid: string, caps: AgentCapability[], tok: string) {
    setSessionId(sid);
    setGrantedCaps(caps);
    setGrantToken(tok);
    setAppState('demo');
    addThreatEvent({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      layer: 'Layer 0',
      action: 'Capability Grant',
      status: 'passed',
      reason: `${caps.length} capabilities signed with hardware key`,
    });
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <Shield className="h-6 w-6 text-blue-400" />
          <div>
            <h1 className="text-lg font-bold tracking-tight">ZeroProof</h1>
            <p className="text-xs text-zinc-400">Cryptographic Identity Binding for LLM API Security</p>
          </div>
          <div className="ml-auto flex items-center gap-3 text-xs text-zinc-500">
            {registered && (
              <span className="flex items-center gap-1 text-emerald-400">
                <CheckCircle2 className="h-3 w-3" /> Registered
              </span>
            )}
            {sessionId && (
              <span className="flex items-center gap-1 text-blue-400">
                <Shield className="h-3 w-3" /> Session Active
              </span>
            )}
          </div>
        </div>
      </header>

      {/* SDK Hero Banner */}
      <div className="border-b border-zinc-800 bg-zinc-900/50">
        <div className="mx-auto max-w-6xl px-6 py-10 space-y-8">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-blue-400">
              <Package className="h-3.5 w-3.5" />
              Drop-in SDK for any LLM app
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Add cryptographic security in 3 lines</h2>
            <p className="text-sm text-zinc-400 max-w-xl">
              ZeroProof wraps your existing LLM calls. No architecture changes. Every prompt gets a hardware-signed proof — tamper, replay, and injection attempts are blocked before they reach your model.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Before */}
            <div className="rounded-xl border border-red-500/20 bg-zinc-950 overflow-hidden">
              <div className="flex items-center gap-2 border-b border-red-500/20 bg-red-500/5 px-4 py-2 text-xs font-semibold text-red-400">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                Before ZeroProof — unprotected
              </div>
              <pre className="p-4 text-xs leading-relaxed text-zinc-300 font-mono overflow-x-auto">{`// Any attacker can intercept & modify this
const response = await openai.chat
  .completions.create({
    messages: [{
      role: 'user',
      content: prompt   // ← unverified, unsigned
    }]
  })`}</pre>
            </div>

            {/* After */}
            <div className="rounded-xl border border-emerald-500/20 bg-zinc-950 overflow-hidden">
              <div className="flex items-center gap-2 border-b border-emerald-500/20 bg-emerald-500/5 px-4 py-2 text-xs font-semibold text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                After ZeroProof — cryptographically secured
              </div>
              <pre className="p-4 text-xs leading-relaxed text-zinc-300 font-mono overflow-x-auto">{`import { ZeroProof } from 'zeroproof-sdk'
const zp = new ZeroProof({ baseUrl: YOUR_SERVER })

// 1. Register once — stores keypair in Secure Enclave
await zp.register(userId)

// 2. Sign + verify prompt with Touch ID (one call)
const { ok, prompt } = await zp.signAndVerify(
  userId, userMessage, sessionId
)
if (!ok) return unauthorized()

// 3. Safe to call your LLM — prompt is verified
const response = await openai.chat
  .completions.create({
    messages: [{ role: 'user', content: prompt }]
  })`}</pre>
            </div>
          </div>

          {/* How it works steps */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { icon: '🔑', title: 'Register Once', desc: 'Hardware keypair generated in Secure Enclave. Private key never leaves device.' },
              { icon: '✍️', title: 'Sign Every Prompt', desc: 'SHA-256 hash signed by Touch ID. Any in-transit modification breaks the signature.' },
              { icon: '🛡️', title: 'Verify on Server', desc: 'Re-hash, check signature, consume nonce, validate capabilities. All before LLM sees it.' },
              { icon: '🤖', title: 'Safe LLM Call', desc: 'Cryptographic proof that this exact prompt, from this exact user, with these exact permissions.' },
            ].map((step, i) => (
              <div key={i} className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 space-y-1">
                <div className="text-lg">{step.icon}</div>
                <div className="text-xs font-semibold text-zinc-200">{step.title}</div>
                <div className="text-xs text-zinc-500 leading-relaxed">{step.desc}</div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <code className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-mono text-emerald-400">
              npm install zeroproof-sdk
            </code>
            <div className="flex items-center gap-1 text-xs text-zinc-500">
              <Code2 className="h-3.5 w-3.5" />
              Works with OpenAI, Anthropic, Groq, Gemini — any LLM
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-8 space-y-8">

        {/* Step indicators */}
        <div className="flex items-center gap-2 text-sm">
          {(['register', 'grant', 'demo'] as AppState[]).map((step, i) => {
            const labels = ['1. Register', '2. Grant Capabilities', '3. Demo'];
            const done = (appState === 'grant' && i === 0) || (appState === 'demo' && i <= 1);
            const active = appState === step;
            return (
              <span key={step} className="flex items-center gap-2">
                <span className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  active && 'bg-blue-600 text-white',
                  done && 'bg-emerald-600/20 text-emerald-400',
                  !active && !done && 'bg-zinc-800 text-zinc-500',
                )}>
                  {labels[i]}
                </span>
                {i < 2 && <span className="text-zinc-600">→</span>}
              </span>
            );
          })}
        </div>

        {/* Step 1: Register */}
        {appState === 'register' && (
          <Card className="border-zinc-700 bg-zinc-900 p-6">
            <div className="max-w-md space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Register Your Device</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  ZeroProof uses WebAuthn (FIDO2) to bind your identity to a hardware key in your
                  device&apos;s Secure Enclave. The private key never leaves your device.
                </p>
              </div>

              <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-xs text-zinc-400 space-y-1">
                <p className="font-semibold text-zinc-300">What happens:</p>
                <p>→ Your device generates a keypair in hardware (Secure Enclave)</p>
                <p>→ The public key is stored on the server</p>
                <p>→ You sign exactly which capabilities AI agents are allowed to use</p>
                <p>→ Any agent action outside that signed list is blocked — regardless of what the AI decides</p>
              </div>

              <Button onClick={doRegister} disabled={registering} className="w-full bg-blue-600 hover:bg-blue-500">
                {registering ? (
                  <span className="flex items-center gap-2">
                    <Fingerprint className="h-4 w-4 animate-pulse" /> Waiting for Touch ID...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Fingerprint className="h-4 w-4" /> Register with Touch ID
                  </span>
                )}
              </Button>

              {registerError && (
                <p className="text-xs text-red-400 flex gap-1">
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                  {registerError}
                </p>
              )}
            </div>
          </Card>
        )}

        {/* Step 2: Grant */}
        {appState === 'grant' && (
          <Card className="border-zinc-700 bg-zinc-900 p-6">
            <div className="max-w-2xl space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Grant Capabilities</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Select exactly what your AI agents are allowed to do this session.
                  Your hardware key will sign the capability set — any agent trying to exceed
                  these permissions will be blocked at Layer 2, regardless of what instructions
                  it receives.
                </p>
              </div>
              <CapabilityGranter userId={userId} onGranted={onGranted} />
            </div>
          </Card>
        )}

        {/* Step 3: Demo */}
        {appState === 'demo' && (
          <div className="space-y-6">
            {/* Granted caps summary + attacker share link */}
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="text-zinc-400 font-semibold">Granted capabilities:</span>
              {grantedCaps.map(cap => (
                <span key={cap} className="rounded border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-blue-300">
                  {cap}
                </span>
              ))}
            </div>

            {/* Two-device demo share */}
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-red-300">🎯 Two-Device Demo</span>
                <span className="text-xs text-zinc-500">Open this link on a second device (phone/laptop) to see the attacker&apos;s perspective live</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <code className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-mono text-red-300 break-all">
                  {typeof window !== 'undefined'
                    ? `${window.location.origin}/attack-demo?token=${encodeURIComponent(grantToken)}`
                    : `/attack-demo?token=${encodeURIComponent(grantToken)}`}
                </code>
                <button
                  onClick={() => {
                    const url = `${window.location.origin}/attack-demo?token=${encodeURIComponent(grantToken)}`;
                    navigator.clipboard.writeText(url);
                  }}
                  className="rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors shrink-0"
                >
                  Copy
                </button>
              </div>
              <p className="text-xs text-zinc-500">
                The attacker device can launch injection attacks against your session.
                With ZeroProof ON: blocked. With ZeroProof OFF: data exfiltrated.
                Even with the token, the attacker cannot exceed your signed capability grant.
              </p>
            </div>

            <Tabs defaultValue="agent" className="space-y-4">
              <TabsList className="bg-zinc-800 border border-zinc-700">
                <TabsTrigger value="agent">Agent Pipeline — Prompt Injection</TabsTrigger>
                <TabsTrigger value="normal">Normal Chat</TabsTrigger>
              </TabsList>

              <TabsContent value="agent" className="space-y-3">
                <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 px-4 py-3 text-sm text-purple-300 space-y-2">
                  <p><strong className="text-purple-200">Real Indirect Prompt Injection Demo — 3 modes:</strong></p>
                  <p>
                    <span className="text-red-300 font-semibold">Unprotected →</span> agent fetches an attacker page,
                    gets fooled, and <em>actually exfiltrates your data</em> to a remote server. You see exactly what the attacker receives.
                  </p>
                  <p>
                    <span className="text-emerald-300 font-semibold">ZeroProof ON →</span> same attack, blocked before the agent can act.
                    Layer 2 checks the signed capability grant. Layer 3 runs a real LLM drift monitor.
                  </p>
                  <p>
                    Two attack surfaces: <a href="/attacker" target="_blank" className="underline text-purple-200 hover:text-white">Climate Article</a> and{' '}
                    <a href="/attacker-readme" target="_blank" className="underline text-purple-200 hover:text-white">GitHub README</a> — showing ZeroProof defends any ingestion pipeline.
                    5/7 models fooled including GPT-oss-120B and LLaMA 4.
                  </p>
                </div>
                <AgentPipelineDemo sessionId={sessionId} grantToken={grantToken} grantedCapabilities={grantedCaps} onThreat={addThreatEvent} />
              </TabsContent>

              <TabsContent value="normal" className="space-y-3">
                <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 px-4 py-3 text-sm text-zinc-400">
                  <strong className="text-zinc-200">Normal flow:</strong> Your prompt is
                  WebAuthn-signed before sending. The server verifies the signature, checks capabilities,
                  then forwards to the LLM. The Proof Chain panel shows the actual cryptographic data.
                </div>
                <ZeroProofChat userId={userId} sessionId={sessionId} grantToken={grantToken} onThreat={addThreatEvent} />
              </TabsContent>
            </Tabs>

            {/* Threat log — always visible */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Security Event Log
              </p>
              <ThreatLog events={threatEvents} />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

