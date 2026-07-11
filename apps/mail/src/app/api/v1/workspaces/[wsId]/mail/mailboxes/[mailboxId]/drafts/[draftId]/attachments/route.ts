import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  copyAttachmentsToDraft,
  uploadDraftAttachment,
} from '@/lib/mail/repository';
import { withMailContext } from '@/lib/mail/route-utils';

type RouteParams = { draftId: string; mailboxId: string; wsId: string };

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { draftId, mailboxId, wsId } = await params;
  if (request.headers.get('content-type')?.includes('application/json')) {
    const parsed = z
      .object({
        attachmentIds: z.array(z.string().uuid()).min(1).max(32),
        sourceMessageId: z.string().uuid(),
      })
      .safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid copy request' },
        { status: 400 }
      );
    }
    return withMailContext(request, wsId, async (ctx) => {
      const attachments = await copyAttachmentsToDraft({
        ...parsed.data,
        ctx,
        draftId,
        mailboxId,
      });
      return NextResponse.json({
        attachments: attachments.map(toAttachment),
      });
    });
  }
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: 'Invalid multipart body' },
      { status: 400 }
    );
  }
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'A file is required' }, { status: 400 });
  }
  const filename = file.name
    .replaceAll(/[\r\n]/gu, ' ')
    .trim()
    .slice(0, 255);
  if (!filename) {
    return NextResponse.json(
      { error: 'A filename is required' },
      { status: 400 }
    );
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const disposition =
    formData.get('disposition') === 'inline' ? 'inline' : 'attachment';
  const rawContentId = formData.get('contentId');
  const contentId =
    typeof rawContentId === 'string' && rawContentId.trim()
      ? rawContentId.trim().slice(0, 998)
      : null;

  return withMailContext(request, wsId, async (ctx) => {
    const attachment = await uploadDraftAttachment({
      bytes,
      contentId,
      contentType: file.type || 'application/octet-stream',
      ctx,
      disposition,
      draftId,
      filename,
      mailboxId,
    });
    return attachment
      ? NextResponse.json(
          {
            attachment: toAttachment(attachment),
          },
          { status: 201 }
        )
      : NextResponse.json({ error: 'Not found' }, { status: 404 });
  });
}

function toAttachment(attachment: Record<string, any>) {
  return {
    contentId: attachment.content_id ?? null,
    contentType: attachment.content_type,
    disposition: attachment.disposition,
    filename: attachment.filename,
    id: attachment.id,
    protectedUrl: null,
    sizeBytes: Number(attachment.size_bytes ?? 0),
  };
}
