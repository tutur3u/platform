import {
  DEFAULT_FEE_NOTICE_TEMPLATE,
  type FeeNoticeTemplate,
} from '@tuturuuu/finance-core/fee-lock';
import type {
  FeeNoticeTemplateInput,
  FeeNoticeTemplateVersion,
} from '@tuturuuu/internal-api/finance-fee-lock-contracts';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { NextResponse } from 'next/server';
import { feeLockErrorResponse } from '../access';

const COLUMNS =
  'version, is_active, body, item_format, item_separator, payment_line, notice_grouping, locale, created_by, created_at';
const KEPT_VERSIONS = 20;

/** Picks the public fields of a template row and narrows its CHECK-constrained text columns. */
export function toFeeNoticeTemplate(
  row: Omit<FeeNoticeTemplateVersion, 'notice_grouping' | 'locale'> & {
    notice_grouping: string;
    locale: string;
  }
): FeeNoticeTemplateVersion {
  return {
    version: row.version,
    is_active: row.is_active,
    body: row.body,
    item_format: row.item_format,
    item_separator: row.item_separator,
    payment_line: row.payment_line,
    notice_grouping:
      row.notice_grouping === 'per_class' ? 'per_class' : 'combined',
    locale: row.locale === 'en' ? 'en' : 'vi',
    created_by: row.created_by,
    created_at: row.created_at,
  };
}

/** The last 20 template versions of the workspace, newest first. */
export async function listFeeNoticeTemplates(
  sbAdmin: TypedSupabaseClient,
  wsId: string
): Promise<
  | { versions: FeeNoticeTemplateVersion[]; response?: never }
  | { versions?: never; response: NextResponse }
> {
  const { data, error } = await sbAdmin
    .from('fee_notice_templates')
    .select(COLUMNS)
    .eq('ws_id', wsId)
    .order('version', { ascending: false })
    .limit(KEPT_VERSIONS);
  if (error) return { response: feeLockErrorResponse(error) };
  return { versions: (data ?? []).map(toFeeNoticeTemplate) };
}

/** The active template, or the built-in default (version null) before the first save. */
export function activeFeeNoticeTemplate(
  versions: FeeNoticeTemplateVersion[]
): FeeNoticeTemplate & { version: number | null } {
  const active = versions.find((row) => row.is_active);
  if (!active) return { ...DEFAULT_FEE_NOTICE_TEMPLATE, version: null };
  const fields: FeeNoticeTemplateInput & { version: number } = {
    version: active.version,
    body: active.body,
    item_format: active.item_format,
    item_separator: active.item_separator,
    payment_line: active.payment_line,
    notice_grouping: active.notice_grouping,
    locale: active.locale,
  };
  return fields;
}

/** `{{centre_name}}`: the workspace name, read with the gate's workspace id. */
export async function getFeeNoticeCentreName(
  sbAdmin: TypedSupabaseClient,
  wsId: string
): Promise<
  { name: string; response?: never } | { name?: never; response: NextResponse }
> {
  const { data, error } = await sbAdmin
    .from('workspaces')
    .select('name')
    .eq('id', wsId)
    .maybeSingle();
  if (error) return { response: feeLockErrorResponse(error) };
  return { name: data?.name ?? '' };
}
