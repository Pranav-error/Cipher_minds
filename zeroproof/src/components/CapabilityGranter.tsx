'use client';

import { useState } from 'react';
import { CAPABILITY_LABELS, CAPABILITY_RISK, type AgentCapability } from '@/lib/capabilities';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Fingerprint, CheckCircle2 } from 'lucide-react';

interface Props {
  onGranted: (sessionId: string, capabilities: AgentCapability[], grantToken: string) => void;
  userId: string;
}

const PRESET_GROUPS = {
  'Research Task': ['web_search_readonly', 'web_fetch_text', 'document_write_local'] as AgentCapability[],
  'Full Research': ['web_search_readonly', 'web_fetch_text', 'web_fetch_full', 'document_read_user', 'document_write_local'] as AgentCapability[],
  'Dangerous (Demo)': ['web_search_readonly', 'web_fetch_text', 'external_api_write', 'email_send'] as AgentCapability[],
};

const RISK_COLOR = {
  low: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  medium: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  high: 'bg-red-500/20 text-red-300 border-red-500/30',
};

export function CapabilityGranter({ onGranted, userId }: Props) {
  const [selected, setSelected] = useState<Set<AgentCapability>>(new Set(['web_search_readonly', 'web_fetch_text', 'document_write_local']));
  const [status, setStatus] = useState<'idle' | 'signing' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  function toggle(cap: AgentCapability) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(cap)) next.delete(cap); else next.add(cap);
      return next;
    });
  }

  function applyPreset(caps: AgentCapability[]) {
    setSelected(new Set(caps));
  }

  async function signGrant() {
    setStatus('signing');
    setError('');
    try {
      const { grantCapabilities } = await import('@/lib/webauthnClient');
      const caps = Array.from(selected);
      const { sessionId, grantToken } = await grantCapabilities(userId, caps);
      setStatus('done');
      onGranted(sessionId, caps, grantToken);
    } catch (err) {
      setError(String(err));
      setStatus('error');
    }
  }

  const allCaps = Object.keys(CAPABILITY_LABELS) as AgentCapability[];

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">Quick Presets</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(PRESET_GROUPS).map(([name, caps]) => (
            <button
              key={name}
              onClick={() => applyPreset(caps)}
              className={cn(
                'rounded border px-3 py-1 text-xs font-medium transition-colors',
                name.includes('Dangerous')
                  ? 'border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20'
                  : 'border-zinc-600 bg-zinc-800 text-zinc-300 hover:bg-zinc-700',
              )}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Capabilities ({selected.size} selected)
        </p>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {allCaps.map(cap => {
            const risk = CAPABILITY_RISK[cap];
            const isSelected = selected.has(cap);
            return (
              <button
                key={cap}
                onClick={() => toggle(cap)}
                className={cn(
                  'flex items-center justify-between rounded-md border px-3 py-2 text-left text-xs transition-all',
                  isSelected
                    ? 'border-blue-500/50 bg-blue-500/10 text-blue-200'
                    : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500',
                )}
              >
                <span className="font-mono">{CAPABILITY_LABELS[cap]}</span>
                <span className={cn('ml-2 rounded border px-1.5 py-0.5 text-[10px] font-semibold', RISK_COLOR[risk])}>
                  {risk}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {status === 'done' ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          <CheckCircle2 className="h-4 w-4" />
          Session authorized — {selected.size} capabilities granted
        </div>
      ) : (
        <Button
          onClick={signGrant}
          disabled={status === 'signing' || selected.size === 0}
          className="w-full bg-blue-600 text-white hover:bg-blue-500"
        >
          {status === 'signing' ? (
            <span className="flex items-center gap-2">
              <Fingerprint className="h-4 w-4 animate-pulse" /> Waiting for Touch ID...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Fingerprint className="h-4 w-4" /> Sign Capability Grant
            </span>
          )}
        </Button>
      )}

      {status === 'error' && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
