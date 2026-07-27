import { connection } from 'next/server';
import {
  embeddingRequestSchema,
  executeEmbeddingRequest,
} from '@/lib/embedding-execution';

export async function POST(request: Request) {
  await connection();
  return executeEmbeddingRequest(
    request,
    embeddingRequestSchema.parse(await request.json())
  );
}
