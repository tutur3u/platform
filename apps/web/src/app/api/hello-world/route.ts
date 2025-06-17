// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { tasks } from '@trigger.dev/sdk/v3';
import type { helloWorldTask } from '@tuturuuu/trigger/example';
import { NextResponse } from 'next/server';

//tasks.trigger also works with the edge runtime
//export const runtime = "edge";

export async function GET() {
  const handle = await tasks.trigger<typeof helloWorldTask>(
    'hello-world',
    'James'
  );

  return NextResponse.json(handle);
}
