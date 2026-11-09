import type { AppealBinding, ConfirmationInput } from './appeal-transport';

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function confirmationContent(
  binding: AppealBinding,
  input: ConfirmationInput
) {
  const url = new URL(input.url);
  if (
    input.purpose !== binding.purpose ||
    url.origin !== binding.confirmationOrigin ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/en/email-appeals' ||
    url.search !== '' ||
    !new URLSearchParams(url.hash.slice(1)).get('token') ||
    input.workspaceName.length > 200 ||
    /[\r\n]/.test(input.email)
  ) {
    throw new Error('appeal_confirmation_content');
  }
  const name = input.workspaceName;
  const text = `You requested verification to receive workspace report emails from ${name}.\n\nConfirm only if you want these workspace reports: ${url.toString()}\n\nThis link expires within 24 hours. Opening it does not opt you in. If you did not request this, ignore this email.\n\nBạn đã yêu cầu xác minh để nhận email báo cáo của không gian làm việc ${name}. Chỉ xác nhận nếu bạn muốn nhận các báo cáo này. Liên kết hết hạn trong vòng 24 giờ; mở liên kết chưa phải là đồng ý. Nếu bạn không yêu cầu, hãy bỏ qua email này.`;
  return {
    Subject: { Data: 'Confirm workspace report emails', Charset: 'UTF-8' },
    Body: {
      Text: { Data: text, Charset: 'UTF-8' },
      Html: {
        Charset: 'UTF-8',
        Data: `<p>You requested verification to receive workspace report emails from <strong>${escapeHtml(name)}</strong>.</p><p><a href="${escapeHtml(url.toString())}">Review and confirm workspace reports / Xem và xác nhận nhận báo cáo</a></p><p>This link expires within 24 hours. Opening it does not opt you in. If you did not request this, ignore this email.</p><p>Bạn đã yêu cầu xác minh để nhận email báo cáo của không gian làm việc <strong>${escapeHtml(name)}</strong>. Chỉ xác nhận nếu bạn muốn nhận các báo cáo này. Liên kết hết hạn trong vòng 24 giờ; mở liên kết chưa phải là đồng ý. Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>`,
      },
    },
  };
}
