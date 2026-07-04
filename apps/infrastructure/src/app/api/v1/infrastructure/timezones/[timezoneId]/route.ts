import { NextResponse } from 'next/server';
import { deleteTimezone, updateTimezone } from '@/lib/infrastructure/timezones';
import { authorizeInfrastructureOperator } from '../../monitoring/blue-green/authorization';

interface Params {
  params: Promise<{
    timezoneId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  try {
    const authorization = await authorizeInfrastructureOperator(req);
    if (!authorization.ok) return authorization.response;

    const { timezoneId: id } = await params;
    const data = await req.json();

    await updateTimezone(id, data);
    return NextResponse.json({ message: 'success' });
  } catch (error) {
    console.info(error);
    return NextResponse.json(
      { message: 'Error updating timezone' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const authorization = await authorizeInfrastructureOperator(request);
    if (!authorization.ok) return authorization.response;

    const { timezoneId: id } = await params;

    await deleteTimezone(id);
    return NextResponse.json({ message: 'success' });
  } catch (error) {
    console.info(error);
    return NextResponse.json(
      { message: 'Error deleting timezone' },
      { status: 500 }
    );
  }
}
