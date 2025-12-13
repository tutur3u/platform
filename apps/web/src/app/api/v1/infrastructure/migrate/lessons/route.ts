import { batchUpsert, createMigrationResponse } from '../batch-upsert';

export async function PUT(req: Request) {
  const json = await req.json();
  const result = await batchUpsert({
    table: 'user_group_posts',
    data: json?.data || [],
  });
  return createMigrationResponse(result, 'lessons');
}
