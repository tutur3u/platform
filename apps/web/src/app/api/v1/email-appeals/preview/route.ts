import { connection } from 'next/server';
import { z } from 'zod';
import { AppealError } from '@/lib/email-appeals/domain';
import { isEmailAppealsEnabled } from '@/lib/email-appeals/flag';
import {
  appealErrorResponse,
  appealJson,
  readAppealJson,
} from '@/lib/email-appeals/http';
import { previewAppeal } from '@/lib/email-appeals/service';
import { createAppealStore } from '@/lib/email-appeals/store';

const schema = z.object({ token: z.string().min(1).max(1024) }).strict();

export async function POST(request: Request) {
  try {
    await connection();
    const parsed = schema.safeParse(await readAppealJson(request));
    if (!parsed.success) throw new AppealError('invalid_request');
    return appealJson(
      await previewAppeal(parsed.data.token, {
        store: await createAppealStore(),
        key: process.env.EMAIL_APPEAL_TOKEN_SECRET ?? '',
        isEnabled: isEmailAppealsEnabled,
      })
    );
  } catch (error) {
    return appealErrorResponse(error);
  }
}
