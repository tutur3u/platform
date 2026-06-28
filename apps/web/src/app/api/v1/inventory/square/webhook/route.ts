import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const url = new URL(request.url);
  const workspaceUrl = `${url.origin}/api/v1/inventory/square/webhook/<workspace-id>`;
  return NextResponse.json(
    {
      message: `Use the workspace Square webhook URL: ${workspaceUrl}`,
    },
    { status: 404 }
  );
}
