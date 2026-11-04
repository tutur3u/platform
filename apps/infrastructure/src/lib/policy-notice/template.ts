// Policy-change notice: Cora's final v4 wording (4 Nov 2026), made
// sanitizer-safe. Inline styles only. Every difference from v4 is listed in the
// pull request and enforced by template.test.ts against the v4 fixture.

export const POLICY_NOTICE_SUBJECT =
  'Tuturuuu: cập nhật Điều khoản và Chính sách quyền riêng tư';

export const POLICY_NOTICE_ALLOWED_LINKS: readonly string[] = [
  'https://tuturuuu.com/legal/changes',
  'https://tuturuuu.com/terms',
  'https://tuturuuu.com/privacy',
  'mailto:legal@tuturuuu.com',
];

export const POLICY_NOTICE_FOOTER_VI =
  'Đây là email thông báo về thay đổi Điều khoản và Chính sách quyền riêng tư của Tuturuuu, không phải email quảng cáo.';

export const POLICY_NOTICE_FOOTER_EN =
  "This is a service notice about changes to Tuturuuu's Terms and Privacy Policy, not a marketing email.";

const FONT =
  "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
const PRIMARY_BUTTON =
  'display:inline-block;margin:0 8px 8px 0;padding:11px 18px;background:#4180E9;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;border-radius:8px;';
const OUTLINE_BUTTON =
  'display:inline-block;margin:0 8px 8px 0;padding:10px 17px;border:1px solid #4180E9;color:#4180E9;text-decoration:none;font-size:14px;font-weight:600;border-radius:8px;';
const H1 = 'font-size:24px;line-height:32px;font-weight:700;color:#111827;';
const H2 =
  'margin:0 0 8px 0;font-size:16px;line-height:24px;font-weight:700;color:#111827;';
const LEAD = 'margin:0 0 20px 0;font-size:15px;line-height:24px;color:#4B5563;';
const LIST =
  'margin:0 0 20px 0;padding-left:20px;font-size:15px;line-height:24px;color:#1F2937;';
const ITEM = 'margin-bottom:6px;';
const BODY = 'margin:0 0 12px 0;font-size:15px;line-height:24px;color:#1F2937;';
const CONTACT = 'margin:0;font-size:14px;line-height:22px;color:#4B5563;';
const FOOTER_NOTE =
  'margin:12px 0 0 0;font-size:13px;line-height:20px;color:#6B7280;';
const LINK = 'color:#4180E9;';

function buttons(labels: [string, string, string]) {
  return `<table cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px 0;"><tr><td>
      <a href="https://tuturuuu.com/legal/changes" style="${PRIMARY_BUTTON}">${labels[0]}</a>
      <a href="https://tuturuuu.com/terms" style="${OUTLINE_BUTTON}">${labels[1]}</a>
      <a href="https://tuturuuu.com/privacy" style="${OUTLINE_BUTTON}">${labels[2]}</a>
    </td></tr></table>`;
}

export const POLICY_NOTICE_HTML = `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Những điểm chính trong Điều khoản và Chính sách quyền riêng tư mới của Tuturuuu. / The key points of Tuturuuu's updated Terms and Privacy Policy.</div>
<table width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F4F5F7;">
<tr><td align="center" style="padding:24px 12px;">
<table width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;">

  <tr><td style="font-size:0;line-height:0;">
    <table width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
      <td height="4" style="background:#4180E9;width:25%;"></td><td height="4" style="background:#4ACA3F;width:25%;"></td>
      <td height="4" style="background:#FB7B05;width:25%;"></td><td height="4" style="background:#E94646;width:25%;"></td>
    </tr></table>
  </td></tr>

  <tr><td style="background:#FFFFFF;border:1px solid #E5E7EB;border-top:0;border-radius:0 0 12px 12px;padding:32px 36px;${FONT}">

    <table cellspacing="0" cellpadding="0" border="0"><tr>
      <td style="vertical-align:middle;font-size:17px;font-weight:700;color:#111827;">Tuturuuu</td>
    </tr></table>

    <h1 style="margin:24px 0 8px 0;${H1}">Chúng tôi cập nhật Điều khoản và Chính sách quyền riêng tư</h1>
    <p style="${LEAD}">Bạn nhận được email này vì bạn là chủ sở hữu hoặc quản trị viên của một không gian làm việc trên Tuturuuu.</p>

    <h2 style="${H2}">Điểm chính</h2>
    <ul style="${LIST}">
      <li style="${ITEM}">Nói rõ vai trò: trường học, trung tâm và doanh nghiệp quản lý dữ liệu học viên, khách hàng của mình; Tuturuuu xử lý dữ liệu thay cho họ.</li>
      <li style="${ITEM}">Có bảng thời hạn lưu trữ dữ liệu và cách yêu cầu xóa.</li>
      <li style="${ITEM}">Nêu rõ các nhà cung cấp AI chúng tôi dùng: Google (Gemini), OpenAI và Anthropic.</li>
      <li style="${ITEM}">Liệt kê đầy đủ quyền của bạn và thời hạn chúng tôi trả lời theo pháp luật Việt Nam.</li>
      <li style="${ITEM}">Bỏ quy định "không hoàn tiền"; quyền của người tiêu dùng được giữ nguyên.</li>
    </ul>

    <h2 style="${H2}">Khi nào áp dụng</h2>
    <p style="${BODY}">Thay đổi có lợi cho bạn hoặc chỉ làm rõ áp dụng từ <strong>ngày 11/11/2026</strong>. Các thay đổi khác áp dụng với tài khoản hiện có từ <strong>ngày 11/12/2026</strong> (với gói trả phí đã mua trước đó: từ ngày gia hạn tiếp theo, nếu muộn hơn). Nếu không đồng ý, bạn có thể đóng tài khoản hoặc hủy gói trước ngày áp dụng, không bị phạt, và được hoàn phí trả trước cho thời gian chưa dùng theo tỷ lệ.</p>

    ${buttons(['Xem toàn bộ thay đổi', 'Điều khoản dịch vụ', 'Chính sách quyền riêng tư'])}

    <p style="${CONTACT}">Câu hỏi và yêu cầu về quyền riêng tư: <a href="mailto:legal@tuturuuu.com" style="${LINK}">legal@tuturuuu.com</a> · 1900 1509</p>
    <p style="${FOOTER_NOTE}">${POLICY_NOTICE_FOOTER_VI}</p>

    <hr style="border:0;border-top:1px solid #E5E7EB;margin:28px 0;">

    <h1 style="margin:0 0 8px 0;${H1}">We've updated our Terms and Privacy Policy</h1>
    <p style="${LEAD}">You're receiving this because you own or administer a workspace on Tuturuuu.</p>

    <h2 style="${H2}">What changed</h2>
    <ul style="${LIST}">
      <li style="${ITEM}">Clearer roles: schools, centres and businesses control their students' and customers' data; Tuturuuu processes it for them.</li>
      <li style="${ITEM}">A table of how long we keep data, and how to ask for deletion.</li>
      <li style="${ITEM}">The AI providers we use are named: Google (Gemini), OpenAI and Anthropic.</li>
      <li style="${ITEM}">Your full list of rights, and our response times under Vietnamese law.</li>
      <li style="${ITEM}">No blanket "no refunds" rule; your consumer rights are not limited.</li>
    </ul>

    <h2 style="${H2}">When it applies</h2>
    <p style="${BODY}">Changes that clarify or are better for you apply from <strong>11 November 2026</strong>. Other changes apply to existing accounts from <strong>11 December 2026</strong> (for a paid plan bought before then: from your next renewal, if later). If you don't agree, you can close your account or cancel your plan before then, without penalty, and we refund prepaid fees for the unused period, pro rata.</p>

    ${buttons(['See all changes', 'Terms of Service', 'Privacy Policy'])}

    <p style="${CONTACT}">Questions and privacy requests: <a href="mailto:legal@tuturuuu.com" style="${LINK}">legal@tuturuuu.com</a> · 1900 1509</p>
    <p style="${FOOTER_NOTE}">${POLICY_NOTICE_FOOTER_EN}</p>

  </td></tr>

  <tr><td style="padding:16px 8px;${FONT}font-size:12px;line-height:18px;color:#6B7280;text-align:center;">
    CÔNG TY CỔ PHẦN TUTURUUU (TUTURUUU JSC) · MST 0318898402<br>
    Tầng 14, Tòa Nhà HM Town, 412 Nguyễn Thị Minh Khai, Phường Bàn Cờ, TP. Hồ Chí Minh
  </td></tr>

</table>
</td></tr>
</table>
`;

export const POLICY_NOTICE_TEXT = `Tuturuuu

CHÚNG TÔI CẬP NHẬT ĐIỀU KHOẢN VÀ CHÍNH SÁCH QUYỀN RIÊNG TƯ
Bạn nhận được email này vì bạn là chủ sở hữu hoặc quản trị viên của một không gian làm việc trên Tuturuuu.

Điểm chính
- Nói rõ vai trò: trường học, trung tâm và doanh nghiệp quản lý dữ liệu học viên, khách hàng của mình; Tuturuuu xử lý dữ liệu thay cho họ.
- Có bảng thời hạn lưu trữ dữ liệu và cách yêu cầu xóa.
- Nêu rõ các nhà cung cấp AI chúng tôi dùng: Google (Gemini), OpenAI và Anthropic.
- Liệt kê đầy đủ quyền của bạn và thời hạn chúng tôi trả lời theo pháp luật Việt Nam.
- Bỏ quy định "không hoàn tiền"; quyền của người tiêu dùng được giữ nguyên.

Khi nào áp dụng
Thay đổi có lợi cho bạn hoặc chỉ làm rõ áp dụng từ ngày 11/11/2026. Các thay đổi khác áp dụng với tài khoản hiện có từ ngày 11/12/2026 (với gói trả phí đã mua trước đó: từ ngày gia hạn tiếp theo, nếu muộn hơn). Nếu không đồng ý, bạn có thể đóng tài khoản hoặc hủy gói trước ngày áp dụng, không bị phạt, và được hoàn phí trả trước cho thời gian chưa dùng theo tỷ lệ.


Xem toàn bộ thay đổi: https://tuturuuu.com/legal/changes
Điều khoản dịch vụ: https://tuturuuu.com/terms
Chính sách quyền riêng tư: https://tuturuuu.com/privacy

Câu hỏi và yêu cầu về quyền riêng tư: legal@tuturuuu.com · 1900 1509

${POLICY_NOTICE_FOOTER_VI}

------------------------------------------------------------

WE'VE UPDATED OUR TERMS AND PRIVACY POLICY
You're receiving this because you own or administer a workspace on Tuturuuu.

What changed
- Clearer roles: schools, centres and businesses control their students' and customers' data; Tuturuuu processes it for them.
- A table of how long we keep data, and how to ask for deletion.
- The AI providers we use are named: Google (Gemini), OpenAI and Anthropic.
- Your full list of rights, and our response times under Vietnamese law.
- No blanket "no refunds" rule; your consumer rights are not limited.

When it applies
Changes that clarify or are better for you apply from 11 November 2026. Other changes apply to existing accounts from 11 December 2026 (for a paid plan bought before then: from your next renewal, if later). If you don't agree, you can close your account or cancel your plan before then, without penalty, and we refund prepaid fees for the unused period, pro rata.


See all changes: https://tuturuuu.com/legal/changes
Terms of Service: https://tuturuuu.com/terms
Privacy Policy: https://tuturuuu.com/privacy

Questions and privacy requests: legal@tuturuuu.com · 1900 1509

${POLICY_NOTICE_FOOTER_EN}

CÔNG TY CỔ PHẦN TUTURUUU (TUTURUUU JSC) · MST 0318898402
Tầng 14, Tòa Nhà HM Town, 412 Nguyễn Thị Minh Khai, Phường Bàn Cờ, TP. Hồ Chí Minh
`;
