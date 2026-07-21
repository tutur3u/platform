import 'server-only';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Database } from '@tuturuuu/types';
import type { Timezone } from '@tuturuuu/types/primitives/Timezone';

type TimezoneInsert = Database['private']['Tables']['timezones']['Insert'];

type TimezoneInput = Pick<
  Timezone,
  'abbr' | 'isdst' | 'offset' | 'text' | 'utc' | 'value'
> & {
  id: string | null;
};

function normalizeUtc(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeTimezoneInput(data: Partial<Timezone>): TimezoneInput {
  return {
    id: data.id ?? null,
    abbr: data.abbr ?? '',
    isdst: data.isdst ?? false,
    offset: data.offset ?? 0,
    text: data.text ?? '',
    utc: normalizeUtc(data.utc),
    value: data.value ?? '',
  };
}

export async function listTimezones() {
  const db = (await createAdminClient({ noCookie: true })).schema('private');
  const { data, error } = await db.from('timezones').select('*').order('value');

  if (error) throw error;
  return data ?? [];
}

export async function listTimezonesByValues(values: string[]) {
  if (!values.length) return [];

  const db = (await createAdminClient({ noCookie: true })).schema('private');
  const { data, error } = await db
    .from('timezones')
    .select('*')
    .in('value', values)
    .order('value');

  if (error) throw error;
  return data ?? [];
}

export async function createTimezone(data: Partial<Timezone>) {
  const db = (await createAdminClient({ noCookie: true })).schema('private');
  const timezone = normalizeTimezoneInput(data);
  const values: TimezoneInsert = {
    abbr: timezone.abbr,
    isdst: timezone.isdst,
    offset: timezone.offset,
    text: timezone.text,
    utc: timezone.utc,
    value: timezone.value,
    ...(timezone.id ? { id: timezone.id } : {}),
  };
  const { data: row, error } = await db
    .from('timezones')
    .insert(values)
    .select('*')
    .single();

  if (error) throw error;
  return row;
}

export async function updateTimezone(id: string, data: Partial<Timezone>) {
  const db = (await createAdminClient({ noCookie: true })).schema('private');
  const timezone = normalizeTimezoneInput(data);
  const { id: _ignoredId, ...values } = timezone;
  const { data: row, error } = await db
    .from('timezones')
    .update(values)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return row;
}

export async function deleteTimezone(id: string) {
  const db = (await createAdminClient({ noCookie: true })).schema('private');
  const { error } = await db.from('timezones').delete().eq('id', id);

  if (error) throw error;
}
