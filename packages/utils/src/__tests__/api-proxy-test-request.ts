import { NextRequest } from 'next/server';

export function makeRequest(
  pathname = '/api/test',
  method = 'POST',
  headers?: Record<string, string>,
  body = '{}'
) {
  return new NextRequest(`http://localhost${pathname}`, {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : body,
  });
}
