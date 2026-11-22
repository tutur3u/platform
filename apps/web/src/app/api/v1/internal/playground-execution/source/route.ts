import { readCloudPlaygroundSource } from '@tuturuuu/storage-core/cloud-playground';
import { AccountServiceError } from '@tuturuuu/utils/account-benefits-server';

const headers = { 'Cache-Control': 'private, no-store' };

export async function POST(request: Request) {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ') || authorization.length > 2055) {
    return new Response(null, { status: 401, headers });
  }
  try {
    return Response.json(
      await readCloudPlaygroundSource(authorization.slice(7)),
      { headers }
    );
  } catch (error) {
    const status = error instanceof AccountServiceError ? error.status : 503;
    return new Response(null, { status, headers });
  }
}
