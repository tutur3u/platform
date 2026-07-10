import { type NextRequest, NextResponse } from 'next/server';
import { uploadDraftAttachment } from '@/lib/mail/repository';
import { withMailContext } from '@/lib/mail/route-utils';

type RouteParams = { draftId: string; mailboxId: string; wsId: string };

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { draftId, mailboxId, wsId } = await params;
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

  return withMailContext(request, wsId, async (ctx) => {
    const attachment = await uploadDraftAttachment({
      bytes,
      contentType: file.type || 'application/octet-stream',
      ctx,
      draftId,
      filename,
      mailboxId,
    });
    return attachment
      ? NextResponse.json(
          {
            attachment: {
              contentId: attachment.content_id ?? null,
              contentType: attachment.content_type,
              disposition: attachment.disposition,
              filename: attachment.filename,
              id: attachment.id,
              protectedUrl: null,
              sizeBytes: Number(attachment.size_bytes ?? 0),
            },
          },
          { status: 201 }
        )
      : NextResponse.json({ error: 'Not found' }, { status: 404 });
  });
}
