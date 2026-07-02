import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { createTimezone, listTimezones } from '@/lib/infrastructure/timezones';
import { authorizeInfrastructureOperator } from '../monitoring/blue-green/authorization';

export async function GET(request: Request) {
  try {
    const authorization = await authorizeInfrastructureOperator(request);
    if (!authorization.ok) return authorization.response;

    const data = await listTimezones();
    return NextResponse.json(data);
  } catch (error) {
    serverLogger.info(error);
    return NextResponse.json(
      { message: 'Error fetching timezones' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const authorization = await authorizeInfrastructureOperator(request);
    if (!authorization.ok) return authorization.response;

    const data = await request.json();
    await createTimezone(data);
    return NextResponse.json({ message: 'success' });
  } catch (error) {
    serverLogger.info(error);
    return NextResponse.json(
      { message: 'Error creating timezone' },
      { status: 500 }
    );
  }
}
