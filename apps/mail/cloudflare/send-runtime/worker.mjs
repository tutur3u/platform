import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { sendMailMessage } from '../../src/lib/mail/repository/send';
import { withMailRequest } from '../../src/runtime/request-context';

export default {
  fetch(request) {
    return withMailRequest({ request }, async () => {
      const supabase = await createAdminClient({ noCookie: true });
      const message = await sendMailMessage({
        ctx: {
          normalizedWsId: 'fixture-workspace',
          supabase,
          user: { id: 'fixture-user' },
        },
        mailboxId: 'fixture-mailbox',
        payload: {
          bodyHtml: '<p>Hello</p>',
          subject: 'Worker send',
          to: ['recipient@example.test'],
        },
      });
      return Response.json({ status: message?.status });
    });
  },
};
