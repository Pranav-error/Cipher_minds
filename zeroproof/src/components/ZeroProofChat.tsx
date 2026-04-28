'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, ShieldCheck, ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LayerStatusPanel, type LayerStatus } from './LayerStatusPanel';
import { cn } from '@/lib/utils';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  verified?: boolean;
  layers?: LayerStatus[];
  tampered?: boolean;
}

interface Props {
  userId: string;
  sessionId: string;
  mitm?: boolean;          // if true, simulate MITM that modifies the prompt
  mitmReplacement?: string;
}

export function ZeroProofChat({ userId, sessionId, mitm = false, mitmReplacement }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [layers, setLayers] = useState<LayerStatus[]>([
    { label: 'Layer 0', description: 'Capability Grant', status: 'pass', reason: 'Signed at session start' },
    { label: 'Layer 1', description: 'Prompt Integrity', status: 'idle' },
    { label: 'Layer 2', description: 'Agent Chain', status: 'idle' },
    { label: 'Layer 3', description: 'Transform Drift', status: 'idle' },
  ]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function setLayer(index: number, update: Partial<LayerStatus>) {
    setLayers(prev => prev.map((l, i) => i === index ? { ...l, ...update } : l));
  }

  async function sendMessage() {
    if (!input.trim() || sending) return;
    const originalPrompt = input.trim();
    setInput('');
    setSending(true);

    // Add user message
    setMessages(prev => [...prev, { role: 'user', content: originalPrompt }]);

    // Reset layers 1-3
    setLayer(1, { status: 'checking', reason: undefined });
    setLayer(2, { status: 'idle', reason: undefined });
    setLayer(3, { status: 'idle', reason: undefined });

    // The prompt that actually gets sent (MITM may modify it)
    const effectivePrompt = mitm && mitmReplacement ? mitmReplacement : originalPrompt;
    const wasTampered = effectivePrompt !== originalPrompt;

    if (wasTampered) {
      setMessages(prev => [...prev, {
        role: 'system',
        content: `[MITM]: Intercepted! Replacing prompt with: "${effectivePrompt}"`,
        tampered: true,
      }]);
    }

    try {
      const { signAndVerifyPrompt } = await import('@/lib/webauthnClient');
      // Layer 1: WebAuthn signs SHA256(originalPrompt + ...) — but effectivePrompt may differ
      const { verified, reason } = await signAndVerifyPrompt(userId, effectivePrompt, sessionId);

      if (!verified) {
        setLayer(1, { status: 'fail', reason: reason ?? 'Prompt integrity check failed' });
        setMessages(prev => [...prev, {
          role: 'system',
          content: `Layer 1 BLOCKED: ${reason ?? 'Proof invalid'}`,
          verified: false,
          layers: [...layers],
        }]);
        setSending(false);
        return;
      }

      setLayer(1, { status: 'pass', reason: 'WebAuthn assertion verified — prompt intact' });
      setLayer(2, { status: 'checking' });

      // Layer 2: no agent chain for direct human chat (skip)
      setLayer(2, { status: 'pass', reason: 'Direct human request — no agent chain required' });
      setLayer(3, { status: 'pass', reason: 'Direct prompt — no transform to validate' });

      // Chat
      const chatRes = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: effectivePrompt, sessionId }),
      });
      const data = await chatRes.json();

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response ?? data.error ?? 'No response',
        verified: true,
      }]);

    } catch (err) {
      setLayer(1, { status: 'fail', reason: String(err) });
      setMessages(prev => [...prev, {
        role: 'system',
        content: `Error: ${String(err)}`,
        verified: false,
      }]);
    }

    setSending(false);
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Chat panel */}
      <div className="flex flex-col rounded-xl border border-zinc-700 bg-zinc-900 lg:col-span-2">
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[320px] max-h-[480px]">
          {messages.length === 0 && (
            <p className="text-center text-sm text-zinc-500 mt-8">Send a message to begin</p>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={cn(
              'flex gap-2',
              msg.role === 'user' && 'justify-end',
              msg.role === 'system' && 'justify-center',
            )}>
              {msg.role === 'system' ? (
                <div className={cn(
                  'rounded-lg border px-3 py-2 text-xs font-mono max-w-sm',
                  msg.tampered
                    ? 'border-red-500/40 bg-red-500/10 text-red-300'
                    : msg.verified === false
                      ? 'border-red-500/40 bg-red-500/10 text-red-300'
                      : 'border-zinc-600 bg-zinc-800 text-zinc-400',
                )}>
                  {msg.content}
                </div>
              ) : (
                <div className={cn(
                  'rounded-xl px-4 py-2.5 text-sm max-w-xs lg:max-w-md',
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-800 text-zinc-100',
                )}>
                  <p>{msg.content}</p>
                  {msg.verified !== undefined && (
                    <div className={cn('mt-1 flex items-center gap-1 text-xs', msg.verified ? 'text-emerald-400' : 'text-red-400')}>
                      {msg.verified
                        ? <><ShieldCheck className="h-3 w-3" /> ZeroProof Verified</>
                        : <><ShieldX className="h-3 w-3" /> Blocked</>
                      }
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* MITM indicator */}
        {mitm && (
          <div className="border-t border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-300">
            MITM Active — prompt will be replaced with: &ldquo;{mitmReplacement}&rdquo;
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2 border-t border-zinc-700 p-3">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="Type a message..."
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
            disabled={sending}
          />
          <Button onClick={sendMessage} disabled={sending || !input.trim()} size="sm" className="bg-blue-600 hover:bg-blue-500">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Layer status */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Security Layers</p>
        <LayerStatusPanel layers={layers} />
      </div>
    </div>
  );
}
