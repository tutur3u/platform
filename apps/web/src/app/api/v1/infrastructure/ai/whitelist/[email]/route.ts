import { type NextRequest, NextResponse } from 'next/server';
import { hasAIWhitelistAccess } from '@/lib/ai-whitelist/authorization';
import {
  deleteAIWhitelistEmail,
  updateAIWhitelistEmailEnabled,
} from '@/lib/ai-whitelist/email-repository';
import { serverLogger } from '@/lib/infrastructure/log-drain';

function forbiddenResponse() {
  return NextResponse.json(
    { message: 'You are not allowed to perform this action' },
    { status: 403 }
  );
}

function normalizeEmailParam(email: string) {
  return decodeURIComponent(email);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ email: string }> }
) {
  try {
    if (!(await hasAIWhitelistAccess(request))) {
      return forbiddenResponse();
    }

    const { email: rawEmail } = await params;
    const email = normalizeEmailParam(rawEmail);
    const { enabled } = await request.json();

    if (!email) {
      return NextResponse.json(
        { message: 'Email is required' },
        { status: 400 }
      );
    }

    await updateAIWhitelistEmailEnabled(email, Boolean(enabled));

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    serverLogger.error('Error updating AI whitelist email:', error);
    return NextResponse.json(
      { message: 'Error updating AI whitelist email' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ email: string }> }
) {
  try {
    if (!(await hasAIWhitelistAccess(request))) {
      return forbiddenResponse();
    }

    const { email: rawEmail } = await params;
    const email = normalizeEmailParam(rawEmail);

    if (!email) {
      return NextResponse.json(
        { message: 'Email is required' },
        { status: 400 }
      );
    }

    await deleteAIWhitelistEmail(email);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    serverLogger.error('Error deleting AI whitelist email:', error);
    return NextResponse.json(
      { message: 'Error deleting AI whitelist email' },
      { status: 500 }
    );
  }
}
