import { connection, NextResponse } from 'next/server';
import {
  listBalancerRuns,
  publishBalancerRuns,
  publishRequestSchema,
} from '@/lib/balancer/store';
import { authorizeDevboxRootMember } from '@/lib/devboxes/authorization';

const MAX_BODY_BYTES = 512 * 1024;

export async function GET(request: Request) {
  await connection();
  const authorization = await authorizeDevboxRootMember(request);
  if (!authorization.ok) return authorization.response;
  try {
    return NextResponse.json({ runs: await listBalancerRuns() });
  } catch (error) {
    console.error('Failed to list balancer runs', error);
    return NextResponse.json(
      { message: 'Failed to list balancer runs' },
      { status: 500 }
    );
  }
}

// Root members publish the runs their own controller recorded. The database
// accepts only a newer revision from the same publisher.
export async function POST(request: Request) {
  const authorization = await authorizeDevboxRootMember(request);
  if (!authorization.ok) return authorization.response;
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES)
    return NextResponse.json({ message: 'Payload too large' }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = publishRequestSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      {
        message: 'Invalid balancer runs',
        issues: parsed.error.issues.slice(0, 5),
      },
      { status: 400 }
    );
  try {
    return NextResponse.json({
      outcomes: await publishBalancerRuns(
        authorization.user.id,
        parsed.data.runs
      ),
    });
  } catch (error) {
    console.error('Failed to publish balancer runs', error);
    return NextResponse.json(
      { message: 'Failed to publish balancer runs' },
      { status: 500 }
    );
  }
}
