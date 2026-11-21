import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeInfrastructureAdminRequest } from '@/lib/infrastructure-admin-access';

const createHolidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().min(1).max(100),
});

export async function GET(req: Request) {
  await connection();
  const auth = await authorizeInfrastructureAdminRequest();
  if (!auth.ok) return auth.response;

  const yearParam = new URL(req.url).searchParams.get('year');
  const year = yearParam ? Number.parseInt(yearParam, 10) : null;
  let query = auth.sbAdmin
    .from('vietnamese_holidays')
    .select('*')
    .order('date', { ascending: true });

  if (year && !Number.isNaN(year)) query = query.eq('year', year);

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching holidays:', error);
    return NextResponse.json(
      { message: 'Error fetching holidays' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const auth = await authorizeInfrastructureAdminRequest();
  if (!auth.ok) return auth.response;

  const parsed = createHolidaySchema.safeParse(
    await req.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.flatten(), message: 'Invalid input' },
      { status: 400 }
    );
  }

  const { data: existing, error: lookupError } = await auth.sbAdmin
    .from('vietnamese_holidays')
    .select('id')
    .eq('date', parsed.data.date)
    .maybeSingle();

  if (lookupError) {
    console.error('Error checking holiday date:', lookupError);
    return NextResponse.json(
      { message: 'Error creating holiday' },
      { status: 500 }
    );
  }
  if (existing) {
    return NextResponse.json(
      { message: 'A holiday already exists for this date' },
      { status: 409 }
    );
  }

  const { data, error } = await auth.sbAdmin
    .from('vietnamese_holidays')
    .insert(parsed.data)
    .select()
    .single();

  if (error) {
    console.error('Error creating holiday:', error);
    return NextResponse.json(
      { message: 'Error creating holiday' },
      { status: 500 }
    );
  }

  return NextResponse.json(data, { status: 201 });
}
