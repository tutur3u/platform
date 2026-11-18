import { connection, type NextRequest, NextResponse } from 'next/server';
import { POST as batch } from '@/lib/cite/api/library/batch';
import {
  GET as listLibrary,
  POST as createItem,
} from '@/lib/cite/api/library/collection';
import {
  DELETE as deleteItem,
  GET as getItem,
  PATCH as updateItem,
} from '@/lib/cite/api/library/item';

type Context = { params: Promise<{ wsId: string; segments?: string[] }> };

function notFound() {
  return NextResponse.json(
    { error: 'NOT_FOUND' },
    { status: 404, headers: { 'Cache-Control': 'private, no-store' } }
  );
}

function methodNotAllowed(allow: string) {
  return new NextResponse(null, { status: 405, headers: { Allow: allow } });
}

// One dynamic route serves the collection, the batch read and single items so
// the deployment keeps a single route entry; every handler keeps its own
// session auth, workspace authorization and payload limit.
async function dispatch(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  request: NextRequest,
  context: Context
) {
  const { wsId, segments = [] } = await context.params;
  const [first, ...rest] = segments;
  if (rest.length > 0) return notFound();
  if (first === undefined) {
    const handler =
      method === 'GET' ? listLibrary : method === 'POST' ? createItem : null;
    return handler
      ? handler(request, { params: Promise.resolve({ wsId }) })
      : methodNotAllowed('GET, POST');
  }
  if (first === 'batch')
    return method === 'POST'
      ? batch(request, { params: Promise.resolve({ wsId }) })
      : methodNotAllowed('POST');
  const handler =
    method === 'GET'
      ? getItem
      : method === 'PATCH'
        ? updateItem
        : method === 'DELETE'
          ? deleteItem
          : null;
  return handler
    ? handler(request, { params: Promise.resolve({ wsId, itemId: first }) })
    : methodNotAllowed('GET, PATCH, DELETE');
}

export async function GET(request: NextRequest, context: Context) {
  await connection();
  return dispatch('GET', request, context);
}

export function POST(request: NextRequest, context: Context) {
  return dispatch('POST', request, context);
}

export function PATCH(request: NextRequest, context: Context) {
  return dispatch('PATCH', request, context);
}

export function DELETE(request: NextRequest, context: Context) {
  return dispatch('DELETE', request, context);
}
