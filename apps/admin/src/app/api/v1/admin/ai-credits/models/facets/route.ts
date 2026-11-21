import { connection, NextResponse } from 'next/server';
import { authorizeAiCreditsAdminRequest } from '../../access';

export async function GET() {
  await connection();

  const auth = await authorizeAiCreditsAdminRequest();
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.sbAdmin
    .schema('private')
    .from('ai_gateway_models')
    .select('provider,type,tags');

  if (error) {
    console.error('Error fetching AI gateway model facets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch model filters' },
      { status: 500 }
    );
  }

  const providers = new Set<string>();
  const types = new Set<string>();
  const tags = new Set<string>();

  for (const model of data ?? []) {
    if (model.provider) providers.add(model.provider);
    if (model.type) types.add(model.type);
    for (const tag of model.tags ?? []) tags.add(tag);
  }

  return NextResponse.json({
    providers: [...providers].sort((a, b) => a.localeCompare(b)),
    tags: [...tags].sort((a, b) => a.localeCompare(b)),
    types: [...types].sort((a, b) => a.localeCompare(b)),
  });
}
