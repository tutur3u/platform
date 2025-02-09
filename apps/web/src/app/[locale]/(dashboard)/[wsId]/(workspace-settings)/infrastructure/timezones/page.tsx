import { CustomDataTable } from '@/components/custom-data-table';
import { timezoneColumns } from '@/data/columns/timezones';
import timezones from '@/data/timezones.json';
import { createAdminClient } from '@tutur3u/supabase/next/server';
import { Timezone } from '@repo/types/primitives/Timezone';
import { notFound } from 'next/navigation';

interface Props {
  searchParams: Promise<{
    q?: string;
    page?: string;
    pageSize?: string;
  }>;
}

export default async function WorkspaceUsersPage({ searchParams }: Props) {
  const { data, count } = await getData(await searchParams);

  return (
    <CustomDataTable
      data={data}
      namespace="timezone-data-table"
      columnGenerator={timezoneColumns}
      count={count}
      defaultVisibility={{
        abbr: false,
        isdst: false,
        created_at: false,
        utc: false,
      }}
    />
  );
}

async function getData({
  q,
  page = '1',
  pageSize = '10',
}: { q?: string; page?: string; pageSize?: string; retry?: boolean } = {}) {
  const supabaseAdmin = await createAdminClient();
  if (!supabaseAdmin) notFound();

  let filteredTimezones = timezones;

  if (q) {
    filteredTimezones = timezones.filter(
      (timezone: Timezone) =>
        timezone.value.includes(q) ||
        timezone.abbr.includes(q) ||
        timezone.text.includes(q)
    );
  }

  const count = filteredTimezones.length;

  if (page && pageSize) {
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(pageSize);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;

    const localData = filteredTimezones.slice(start, end);
    const { data: serverData } = (await supabaseAdmin
      .from('timezones')
      .select('*')
      .in(
        'value',
        localData.map((row) => row.value)
      )
      .limit(parsedSize)) as { data: Timezone[] };

    if (!serverData) notFound();

    // If server data matches local data, include status = 'synced'
    // If server data partially matches local data, include status = 'outdated'
    // If server data does not match local data, include status = 'outdated'
    // reserved for future use: If server data is more than local data, include status = 'pending'

    const tzsWithStatus = localData.map((row: Timezone) => {
      const serverRow = serverData.find((r: Timezone) => r.value === row.value);

      if (serverRow) {
        return {
          ...serverRow,
          ...row,
          status: 'synced',
        };
      }

      return {
        ...row,
        status: 'outdated',
      };
    });

    return { data: tzsWithStatus, count } as {
      data: Timezone[];
      count: number;
    };
  }

  return { data: filteredTimezones, count } as {
    data: Timezone[];
    count: number;
  };
}
