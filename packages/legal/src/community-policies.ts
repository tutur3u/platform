import type { CommunityPolicyKind, LegalDocument, LegalLocale } from './types';

const policies: Record<
  LegalLocale,
  Record<CommunityPolicyKind, Array<[string, string]>>
> = {
  en: {
    'acceptable-use': [
      [
        'Lawful and authorized use',
        'Use Tuturuuu only for lawful purposes and data you are authorized to process. Do not distribute malware, stolen credentials, unlawful sexual content, exploitative material, or content that infringes another person’s rights. Do not use workspace access, invitations, APIs, integrations or shared links to bypass another person’s permissions.',
      ],
      [
        'Finite budgets and fair resource use',
        'AI, file storage, transfers, meetings, recordings, email and hosted execution consume finite resources. Follow the displayed plan allowances and technical limits. Do not create accounts, workspaces, API keys or repeated jobs to evade quotas, multiply promotional credits, conceal usage, or bypass spending limits. Buying additional credits does not authorize abusive traffic or defeat provider safety controls.',
      ],
      [
        'Communications and automation',
        'Do not send spam, impersonate senders, harvest contacts or conduct unauthorized surveillance. Obtain required consent for recording, transcription, outreach and automated processing. Review agent permissions and outcomes; restrict tools to the resources and actions the user or administrator has authorized. Do not use automation to collect secrets or confidential data without permission.',
      ],
      [
        'Security research and reporting',
        'Report suspected vulnerabilities privately to security@tuturuuu.com with the affected service and reproducible steps. Do not access other tenants, exfiltrate personal data, run disruptive load tests or persist access without prior written authorization. Stop if testing exposes another person’s data. Reporting a vulnerability does not grant permission for unrestricted testing.',
      ],
      [
        'Enforcement and review',
        'Tuturuuu may throttle requests, stop a job, restrict a feature or suspend an account to address abuse, security, non-payment or legal obligations. Where practicable, action is proportionate and includes notice and a path to request review at legal@tuturuuu.com. Include account or workspace identifiers and relevant timestamps; do not include passwords or payment-card data. Mandatory legal rights remain available.',
      ],
    ],
    'community-guidelines': [
      [
        'Respect people and their boundaries',
        'Communicate constructively. Do not harass, threaten, dox, discriminate against or exploit others. Respect workspace roles, moderators and the boundaries of private conversations. Criticism of ideas and product feedback is welcome; targeting people with abuse is not.',
      ],
      [
        'Share responsibly',
        'Share only content you have permission to use. Do not post private contact information, confidential workspace material or recordings without the required consent. Clearly identify promotional material and avoid deceptive claims, impersonation and spam. Label AI-generated material when its origin could materially affect how others understand it.',
      ],
      [
        'Protect learners and participants',
        'Teachers, hosts and administrators must apply appropriate consent, supervision and access controls. Do not use community spaces to exploit minors or solicit inappropriate contact. Report unsafe content and avoid reposting it. Meeting participants should know when recording, transcription or AI assistance is active.',
      ],
      [
        'Use shared capacity considerately',
        'Respect meeting participant limits, storage allowances, AI budgets and communications limits. Additional credits purchase defined usage; they do not buy exemption from moderation or security controls. Avoid repeated large uploads, automated message floods or disruptive meeting behavior.',
      ],
      [
        'Reports, moderation and appeals',
        'Use available in-product reporting tools or contact community@tuturuuu.com with relevant context. Moderators may remove content, restrict participation or refer serious cases to security or legal review. Decisions may be challenged through the same contact channel. Do not retaliate against someone for making a good-faith report.',
      ],
    ],
  },
  vi: {
    'acceptable-use': [
      [
        'Sử dụng hợp pháp và được phép',
        'Chỉ dùng Tuturuuu cho mục đích hợp pháp và dữ liệu bạn có quyền xử lý. Không phân phối mã độc, thông tin đăng nhập đánh cắp, nội dung tình dục trái luật, nội dung bóc lột hoặc xâm phạm quyền người khác. Không dùng quyền không gian, lời mời, API, tích hợp hoặc liên kết chia sẻ để vượt quyền của người khác.',
      ],
      [
        'Ngân sách hữu hạn và sử dụng công bằng',
        'AI, lưu trữ, truyền tệp, cuộc họp, bản ghi, email và chạy tác vụ tiêu thụ tài nguyên hữu hạn. Tuân thủ hạn mức gói và giới hạn kỹ thuật được hiển thị. Không tạo tài khoản, không gian, khóa API hoặc tác vụ lặp để né hạn mức, nhân tín dụng khuyến mại, che giấu mức dùng hoặc vượt ngân sách. Mua tín dụng bổ sung không cho phép lưu lượng lạm dụng hay bỏ qua kiểm soát an toàn.',
      ],
      [
        'Liên lạc và tự động hóa',
        'Không gửi thư rác, mạo danh người gửi, thu thập liên hệ trái phép hoặc giám sát không được cho phép. Có sự đồng ý cần thiết cho ghi âm, phiên âm, liên hệ và xử lý tự động. Rà soát quyền và kết quả tác tử; giới hạn công cụ trong tài nguyên và hành động đã được người dùng hoặc quản trị viên cho phép. Không tự động thu thập bí mật hoặc dữ liệu mật khi chưa có quyền.',
      ],
      [
        'Nghiên cứu và báo cáo bảo mật',
        'Báo cáo riêng lỗ hổng nghi ngờ đến security@tuturuuu.com kèm dịch vụ và bước tái hiện. Không truy cập tenant khác, lấy dữ liệu cá nhân, kiểm thử tải gây gián đoạn hoặc duy trì truy cập khi chưa được cho phép bằng văn bản. Dừng nếu kiểm thử làm lộ dữ liệu người khác. Báo cáo lỗ hổng không cấp quyền kiểm thử không giới hạn.',
      ],
      [
        'Thực thi và xem xét',
        'Tuturuuu có thể giới hạn yêu cầu, dừng tác vụ, hạn chế tính năng hoặc đình chỉ tài khoản để xử lý lạm dụng, bảo mật, không thanh toán hoặc nghĩa vụ pháp luật. Khi có thể, biện pháp tương xứng, có thông báo và kênh xem xét tại legal@tuturuuu.com. Cung cấp mã tài khoản hoặc không gian và thời điểm; không gửi mật khẩu hay thông tin thẻ. Quyền pháp lý bắt buộc vẫn được giữ.',
      ],
    ],
    'community-guidelines': [
      [
        'Tôn trọng con người và ranh giới',
        'Trao đổi mang tính xây dựng. Không quấy rối, đe dọa, tiết lộ thông tin riêng, phân biệt đối xử hoặc bóc lột. Tôn trọng vai trò không gian, người điều hành và trò chuyện riêng tư. Hoan nghênh phản biện ý tưởng và góp ý sản phẩm; không chấp nhận công kích lạm dụng cá nhân.',
      ],
      [
        'Chia sẻ có trách nhiệm',
        'Chỉ chia sẻ nội dung bạn có quyền sử dụng. Không đăng liên hệ riêng, tài liệu mật hoặc bản ghi khi thiếu sự đồng ý cần thiết. Xác định rõ nội dung quảng bá, tránh tuyên bố lừa dối, mạo danh và thư rác. Gắn nhãn nội dung do AI tạo khi nguồn gốc có thể ảnh hưởng đáng kể đến cách người khác hiểu nội dung.',
      ],
      [
        'Bảo vệ người học và người tham gia',
        'Giáo viên, chủ trì và quản trị viên phải áp dụng đồng ý, giám sát và quyền truy cập phù hợp. Không dùng cộng đồng để bóc lột trẻ vị thành niên hoặc đề nghị liên hệ không phù hợp. Báo cáo nội dung không an toàn và tránh đăng lại. Người dự họp cần biết khi ghi âm, phiên âm hoặc hỗ trợ AI đang hoạt động.',
      ],
      [
        'Tôn trọng tài nguyên chung',
        'Tuân thủ giới hạn người dự họp, lưu trữ, ngân sách AI và liên lạc. Tín dụng bổ sung mua mức dùng xác định, không mua quyền miễn kiểm duyệt hoặc kiểm soát bảo mật. Tránh tải tệp lớn lặp lại, gửi tin tự động dồn dập hoặc phá rối cuộc họp.',
      ],
      [
        'Báo cáo, điều hành và kháng nghị',
        'Dùng công cụ báo cáo trong sản phẩm hoặc liên hệ community@tuturuuu.com với ngữ cảnh liên quan. Người điều hành có thể xóa nội dung, hạn chế tham gia hoặc chuyển vụ việc nghiêm trọng cho bộ phận bảo mật/pháp lý. Có thể đề nghị xem xét quyết định qua cùng kênh. Không trả đũa người báo cáo thiện chí.',
      ],
    ],
  },
};

export function getCommunityPolicy(
  kind: CommunityPolicyKind,
  locale: string
): LegalDocument {
  const language = locale === 'vi' ? 'vi' : 'en';
  const vi = language === 'vi';
  const title =
    kind === 'acceptable-use'
      ? vi
        ? 'Sử dụng'
        : 'Acceptable Use'
      : vi
        ? 'Nguyên tắc'
        : 'Community';
  const sections = policies[language][kind].map(([heading, content]) => ({
    title: heading,
    content,
    icon: 'shield' as const,
    tone: 'blue' as const,
  }));
  return {
    kind,
    locale: language,
    title,
    highlightedWord:
      kind === 'acceptable-use'
        ? vi
          ? 'Chấp nhận được'
          : 'Policy'
        : vi
          ? 'Cộng đồng'
          : 'Guidelines',
    badge: vi ? 'Bản dự thảo cần rà soát' : 'Draft for review',
    effectiveDate: '2026-02-06',
    publishedDate: '2026-09-13',
    version: '2026-09-13-draft',
    reviewRequired: true,
    footer: vi
      ? 'Bản sửa đổi để rà soát; chưa phải thỏa thuận mới có hiệu lực. Liên hệ legal@tuturuuu.com.'
      : 'Draft revision for review; not a newly effective agreement. Contact legal@tuturuuu.com.',
    summaryTitle: vi ? 'Tổng quan' : 'At a glance',
    summaryDescription: vi
      ? 'Bản tóm tắt không thay thế toàn bộ chính sách.'
      : 'This summary does not replace the complete policy.',
    summaryRows: sections
      .slice(0, 3)
      .map((section) => ({ topic: section.title, summary: section.content })),
    sections,
  };
}
