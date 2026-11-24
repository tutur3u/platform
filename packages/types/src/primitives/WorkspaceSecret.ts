export interface WorkspaceSecret {
  id?: string;
  ws_id?: string;
  name?: string;
  value?: string | null;
  created_at?: string;
  /** Storage tier from `@tuturuuu/utils/workspace-secret-policy`. */
  tier?: 'config' | 'credential';
  /** Whether a non-empty value is stored, even when `value` is withheld. */
  value_set?: boolean;
  /** True when the server withheld `value` from this response. */
  value_masked?: boolean;
}
