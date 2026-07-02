import 'server-only';

import type { Timezone } from '@tuturuuu/types/primitives/Timezone';
import { getPlatformSql } from '@/lib/database/platform-sql';

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
  const sql = getPlatformSql();

  return sql<Timezone[]>`
    select
      id::text as id,
      value,
      abbr,
      offset,
      isdst,
      text,
      utc,
      created_at::text as created_at
    from private.timezones
    order by value
  `;
}

export async function listTimezonesByValues(values: string[]) {
  if (!values.length) return [];

  const sql = getPlatformSql();

  return sql<Timezone[]>`
    select
      id::text as id,
      value,
      abbr,
      offset,
      isdst,
      text,
      utc,
      created_at::text as created_at
    from private.timezones
    where value = any(${values}::text[])
    order by value
  `;
}

export async function createTimezone(data: Partial<Timezone>) {
  const sql = getPlatformSql();
  const timezone = normalizeTimezoneInput(data);

  const [row] = await sql<Timezone[]>`
    insert into private.timezones (
      id,
      value,
      abbr,
      offset,
      isdst,
      text,
      utc
    )
    values (
      coalesce(${timezone.id}::uuid, gen_random_uuid()),
      ${timezone.value},
      ${timezone.abbr},
      ${timezone.offset},
      ${timezone.isdst},
      ${timezone.text},
      ${timezone.utc}::text[]
    )
    returning
      id::text as id,
      value,
      abbr,
      offset,
      isdst,
      text,
      utc,
      created_at::text as created_at
  `;

  return row;
}

export async function updateTimezone(id: string, data: Partial<Timezone>) {
  const sql = getPlatformSql();
  const timezone = normalizeTimezoneInput(data);

  const [row] = await sql<Timezone[]>`
    update private.timezones
    set
      value = ${timezone.value},
      abbr = ${timezone.abbr},
      offset = ${timezone.offset},
      isdst = ${timezone.isdst},
      text = ${timezone.text},
      utc = ${timezone.utc}::text[]
    where id = ${id}::uuid
    returning
      id::text as id,
      value,
      abbr,
      offset,
      isdst,
      text,
      utc,
      created_at::text as created_at
  `;

  return row;
}

export async function deleteTimezone(id: string) {
  const sql = getPlatformSql();

  await sql`
    delete from private.timezones
    where id = ${id}::uuid
  `;
}
