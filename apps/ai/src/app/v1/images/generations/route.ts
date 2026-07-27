import { connection } from 'next/server';
import { executeImageRequest, imageRequestSchema } from '@/lib/image-execution';

export async function POST(request: Request) {
  await connection();
  return executeImageRequest(
    request,
    imageRequestSchema.parse(await request.json())
  );
}
