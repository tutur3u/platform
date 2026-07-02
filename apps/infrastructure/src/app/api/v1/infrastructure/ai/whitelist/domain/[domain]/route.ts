import { NextResponse } from 'next/server';
import { hasAIWhitelistAccess } from '@/lib/ai-whitelist/authorization';
import {
  deleteAIWhitelistDomain,
  updateAIWhitelistDomainEnabled,
} from '@/lib/ai-whitelist/domain-repository';
import { serverLogger } from '@/lib/infrastructure/log-drain';

function forbiddenResponse() {
  return NextResponse.json(
    { message: 'You are not allowed to perform this action' },
    { status: 403 }
  );
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ domain: string }> }
) {
  try {
    if (!(await hasAIWhitelistAccess(request))) {
      return forbiddenResponse();
    }

    const { domain } = await params;
    const { enabled } = await request.json();

    await updateAIWhitelistDomainEnabled(domain, Boolean(enabled));

    return NextResponse.json({ success: true });
  } catch (error) {
    serverLogger.error('Error updating domain:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ domain: string }> }
) {
  try {
    if (!(await hasAIWhitelistAccess(request))) {
      return forbiddenResponse();
    }

    const { domain } = await params;

    await deleteAIWhitelistDomain(domain);

    return NextResponse.json({ success: true });
  } catch (error) {
    serverLogger.error('Error deleting domain:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
