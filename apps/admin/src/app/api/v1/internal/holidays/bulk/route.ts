import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeInfrastructureAdminRequest } from '@/lib/infrastructure-admin-access';

const holidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().min(1).max(100),
});

const bulkImportSchema = z.object({
  holidays: z.array(holidaySchema).min(1).max(100),
  replaceExisting: z.boolean().optional().default(false),
});

export async function POST(req: Request) {
  const auth = await authorizeInfrastructureAdminRequest();
  if (!auth.ok) return auth.response;

  const parsed = bulkImportSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.flatten(), message: 'Invalid input' },
      { status: 400 }
    );
  }

  const { holidays, replaceExisting } = parsed.data;
  const years = [
    ...new Set(
      holidays.map(({ date }) => Number.parseInt(date.slice(0, 4), 10))
    ),
  ];

  if (replaceExisting) {
    const { error } = await auth.sbAdmin
      .from('vietnamese_holidays')
      .delete()
      .in('year', years);
    if (error) {
      console.error('Error deleting existing holidays:', error);
      return NextResponse.json(
        { message: 'Error deleting existing holidays' },
        { status: 500 }
      );
    }
  }

  const { data, error } = await auth.sbAdmin
    .from('vietnamese_holidays')
    .upsert(holidays, {
      ignoreDuplicates: !replaceExisting,
      onConflict: 'date',
    })
    .select();

  if (error) {
    console.error('Error inserting holidays:', error);
    return NextResponse.json(
      { message: 'Error inserting holidays' },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      imported: data?.length ?? 0,
      message: 'Holidays imported successfully',
      yearsAffected: years,
    },
    { status: 201 }
  );
}
