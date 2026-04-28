export type AgentCapability =
  | 'web_search_readonly'
  | 'web_fetch_text'
  | 'web_fetch_full'
  | 'document_read_user'
  | 'document_write_local'
  | 'document_write_external'
  | 'code_execute_sandboxed'
  | 'code_execute_networked'
  | 'email_read_metadata'
  | 'email_read_full'
  | 'email_send_draft'
  | 'email_send'
  | 'external_api_readonly'
  | 'external_api_write';

export const CAPABILITY_LABELS: Record<AgentCapability, string> = {
  web_search_readonly: 'Web Search (read-only)',
  web_fetch_text: 'Fetch Web Pages (text)',
  web_fetch_full: 'Fetch Web Pages (full)',
  document_read_user: 'Read User Documents',
  document_write_local: 'Write Documents (local)',
  document_write_external: 'Write Documents (external)',
  code_execute_sandboxed: 'Execute Code (sandboxed)',
  code_execute_networked: 'Execute Code (networked)',
  email_read_metadata: 'Read Email Metadata',
  email_read_full: 'Read Email (full)',
  email_send_draft: 'Draft Emails',
  email_send: 'Send Emails',
  external_api_readonly: 'External API (read)',
  external_api_write: 'External API (write)',
};

export const CAPABILITY_RISK: Record<AgentCapability, 'low' | 'medium' | 'high'> = {
  web_search_readonly: 'low',
  web_fetch_text: 'low',
  web_fetch_full: 'medium',
  document_read_user: 'low',
  document_write_local: 'low',
  document_write_external: 'medium',
  code_execute_sandboxed: 'medium',
  code_execute_networked: 'high',
  email_read_metadata: 'low',
  email_read_full: 'medium',
  email_send_draft: 'medium',
  email_send: 'high',
  external_api_readonly: 'medium',
  external_api_write: 'high',
};

export interface CapabilityGrant {
  sessionId: string;
  granted: AgentCapability[];
  issuedAt: number;
  expiresAt: number;
  // Base64url-encoded WebAuthn assertion over SHA256(canonical JSON of grant)
  webauthnAssertion?: string;
}

export function hasCapability(grant: CapabilityGrant, cap: AgentCapability): boolean {
  return grant.granted.includes(cap);
}

export function grantCanonical(grant: Omit<CapabilityGrant, 'webauthnAssertion'>): string {
  return JSON.stringify({
    sessionId: grant.sessionId,
    granted: [...grant.granted].sort(),
    issuedAt: grant.issuedAt,
    expiresAt: grant.expiresAt,
  });
}
