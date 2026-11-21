import { htmlEscape } from '@/lib/topic-announcements-email';

export interface AuthRecoveryEmailTemplateInput {
  code: string;
  codeUrl: string;
  confirmUrl: string;
  expiresInMinutes: number;
}

export function renderAuthRecoveryEmail({
  code,
  codeUrl,
  confirmUrl,
  expiresInMinutes,
}: AuthRecoveryEmailTemplateInput) {
  const subject = 'Your Tuturuuu recovery login link';
  const safeConfirmUrl = htmlEscape(confirmUrl);
  const safeCodeUrl = htmlEscape(codeUrl);
  const safeCode = htmlEscape(code);
  const expiryText = `${expiresInMinutes} minutes`;

  return {
    subject,
    html: `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <title>${htmlEscape(subject)}</title>
  </head>
  <body style="margin:0;background:#f8fafc;color:#111827;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f8fafc">
      <tbody>
        <tr>
          <td align="center" style="padding:32px 12px">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;border-collapse:collapse">
              <tbody>
                <tr>
                  <td style="border:1px solid #e5e7eb;border-radius:14px;background:#ffffff;padding:28px">
                    <p style="margin:0 0 10px 0;color:#64748b;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase">Tuturuuu account recovery</p>
                    <h1 style="margin:0;color:#0f172a;font-size:26px;line-height:32px">Sign in to your account</h1>
                    <p style="margin:14px 0 0 0;color:#334155;font-size:15px;line-height:24px">An administrator approved a temporary recovery sign-in for this email address. Use the button below to sign in, or enter the verification code on the recovery page.</p>
                    <p style="margin:24px 0 0 0">
                      <a href="${safeConfirmUrl}" style="display:inline-block;border-radius:8px;background:#0f172a;color:#ffffff;padding:12px 16px;font-size:15px;font-weight:700;text-decoration:none">Sign in with recovery link</a>
                    </p>
                    <div style="margin-top:24px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;padding:18px">
                      <p style="margin:0 0 8px 0;color:#475569;font-size:13px;line-height:20px">Verification code</p>
                      <p style="margin:0;color:#0f172a;font-size:30px;font-weight:800;letter-spacing:.12em">${safeCode}</p>
                      <p style="margin:12px 0 0 0;color:#475569;font-size:13px;line-height:20px">Open <a href="${safeCodeUrl}" style="color:#0f172a;font-weight:700">the recovery page</a> and enter this code if the button does not work.</p>
                    </div>
                    <p style="margin:18px 0 0 0;color:#64748b;font-size:13px;line-height:20px">This recovery email expires in ${htmlEscape(expiryText)} and can only be used once. Only use it if you are the intended recipient. If you did not request help signing in, ignore this email and contact support.</p>
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`,
    text: `Tuturuuu account recovery

An administrator approved a temporary recovery sign-in for this email address.

Sign in with this link:
${confirmUrl}

Or open this page and enter the verification code:
${codeUrl}

Verification code: ${code}

This recovery email expires in ${expiryText} and can only be used once. Only use it if you are the intended recipient. If you did not request help signing in, ignore this email and contact support.`,
  };
}
