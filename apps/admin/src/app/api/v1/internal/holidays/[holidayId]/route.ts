import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeInfrastructureAdminRequest } from '@/lib/infrastructure-admin-access';

interface Params {
  params: Promise<{ holidayId: string }>;
}

const updateHolidaySchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    name: z.string().min(1).max(100).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'No updates provided');

export async function PUT(req: Request, { params }: Params) {
  const auth = await authorizeInfrastructureAdminRequest();
  if (!auth.ok) return auth.response;

  const { holidayId } = await params;
  const parsed = updateHolidaySchema.safeParse(
    await req.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.flatten(), message: 'Invalid input' },
      { status: 400 }
    );
  }

  if (parsed.data.date) {
    const { data: conflict, error: conflictError } = await auth.sbAdmin
      .from('vietnamese_holidays')
      .select('id')
      .eq('date', parsed.data.date)
      .neq('id', holidayId)
      .maybeSingle();
    if (conflictError) {
      console.error('Error checking holiday date:', conflictError);
      return NextResponse.json(
        { message: 'Error updating holiday' },
        { status: 500 }
      );
    }
    if (conflict) {
      return NextResponse.json(
        { message: 'A holiday already exists for this date' },
        { status: 409 }
      );
    }
  }

  const { data, error } = await auth.sbAdmin
    .from('vietnamese_holidays')
    .update(parsed.data)
    .eq('id', holidayId)
    .select()
    .maybeSingle();

  if (error) {
    console.error('Error updating holiday:', error);
    return NextResponse.json(
      { message: 'Error updating holiday' },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json({ message: 'Holiday not found' }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function DELETE(_: Request, { params }: Params) {
  const auth = await authorizeInfrastructureAdminRequest();
  if (!auth.ok) return auth.response;

  const { holidayId } = await params;
  const { error } = await auth.sbAdmin
    .from('vietnamese_holidays')
    .delete()
    .eq('id', holidayId);

  if (error) {
    console.error('Error deleting holiday:', error);
    return NextResponse.json(
      { message: 'Error deleting holiday' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'Holiday deleted' });
}
