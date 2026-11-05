import type { CommunityPolicyKind, LegalDocument, LegalLocale } from './types';

const policies: Record<
  LegalLocale,
  Record<CommunityPolicyKind, Array<[string, string]>>
> = {
  en: {
    'acceptable-use': [
      [
        'Prohibited activities',
        'The following activities are strictly prohibited:\n\n1. **Illegal Activities**\n   * Using the Services for any unlawful purpose or to promote illegal activities\n   * Money laundering, fraud, or financial crimes\n   * Distribution of illegal content or materials\n\n2. **Abuse & Harassment**\n   * Harassment, stalking, threats, or intimidation of any individual\n   * Doxing — publishing private information about others without consent\n   * Coordinated inauthentic behavior or manipulation campaigns\n\n3. **Malicious Technical Activities**\n   * Distributing malware, viruses, or other harmful software\n   * Attempting unauthorized access to accounts, systems, or data\n   * Conducting denial-of-service attacks or network disruption\n   * Exploiting vulnerabilities without responsible disclosure (see [Terms of Service](/terms))\n\n4. **Deceptive Practices**\n   * Phishing, social engineering, or impersonation\n   * Creating fake accounts or artificially inflating metrics\n   * Spreading misinformation or disinformation at scale\n\n5. **Content Violations**\n   * Child sexual abuse material (CSAM) — immediately reported to authorities\n   * Terrorism-related content or promotion of extremist ideologies\n   * Non-consensual intimate imagery\n   * Deepfakes or misleading synthetic media (see AI features below)',
      ],
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
        'AI features and the age restriction',
        'Tuturuuu integrates AI features across the platform. When using AI tools, you must:\n\n1. **Honest Representation**\n   * Do not present AI-generated content as exclusively human-created when attribution matters\n   * Be transparent with your team about AI assistance where relevant\n   * Understand that AI outputs may contain errors and should be reviewed\n\n2. **Prohibited AI Uses**\n   * Generating harmful, deceptive, or illegal content\n   * Attempting to bypass safety filters or content moderation\n   * Using AI features to harass, impersonate, or deceive others\n   * Creating deepfakes or misleading synthetic media\n   * Automated bulk content generation intended to spam or manipulate\n\n3. **Age Restrictions**\n   * AI features are restricted to users **18 years of age or older**\n   * Do not share AI feature access with minors',
      ],
      [
        'Security research and reporting',
        'Report suspected vulnerabilities privately to security@tuturuuu.com with the affected service and reproducible steps. Do not access other tenants, exfiltrate personal data, run disruptive load tests or persist access without prior written authorization. Stop if testing exposes another person’s data. Reporting a vulnerability does not grant permission for unrestricted testing.',
      ],
      [
        'Enforcement and review',
        'Tuturuuu may throttle requests, stop a job, restrict a feature or suspend an account to address abuse, security, non-payment or legal obligations. Where practicable, action is proportionate and includes notice and a path to request review at legal@tuturuuu.com. Include account or workspace identifiers and relevant timestamps; do not include passwords or payment-card data. Mandatory legal rights remain available.',
      ],
      [
        'Graduated response, immediate action and appeals',
        'Violations of this Acceptable Use Policy may result in:\n\n1. **Graduated Response**\n   * **Notice** — notification of the violation with guidance on remediation\n   * **Feature Restriction** — temporary limitation of specific features (e.g., AI access, API usage)\n   * **Account Suspension** — temporary suspension of account access\n   * **Account Termination** — permanent removal from the platform\n\n2. **Immediate Action**\n   * Severe violations (illegal content, active attacks, CSAM) result in immediate account termination and may be reported to law enforcement\n   * Accounts involved in ongoing security threats may be suspended without prior notice\n\n3. **Appeals**\n   * You may appeal enforcement decisions by contacting **legal@tuturuuu.com** within 30 days\n   * Appeals are reviewed by a member of the team not involved in the original decision\n   * We aim to respond to appeals within 10 business days',
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
        'AI usage responsibility',
        'Tuturuuu integrates AI features across the platform. When using AI tools, you must:\n\n1. **Honest Representation**\n   * Do not present AI-generated content as exclusively human-created when attribution matters\n   * Be transparent with your team about AI assistance where relevant\n   * Understand that AI outputs may contain errors and should be reviewed\n\n2. **Prohibited AI Uses**\n   * Generating harmful, deceptive, or illegal content\n   * Attempting to bypass safety filters or content moderation\n   * Using AI features to harass, impersonate, or deceive others\n   * Creating deepfakes or misleading synthetic media\n   * Automated bulk content generation intended to spam or manipulate\n\n3. **Age Restrictions**\n   * AI features are restricted to users **18 years of age or older**\n   * Do not share AI feature access with minors\n\nFor more details, see our [Acceptable Use Policy](/acceptable-use).',
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
      [
        'Enforcement steps and appeals',
        'Violations of these Community Guidelines may result in the following actions, depending on severity:\n\n1. **Warning** — a private notice explaining the violation and expected corrective behavior\n2. **Content Removal** — removal of offending content from the platform\n3. **Temporary Suspension** — temporary restriction of account access\n4. **Permanent Ban** — permanent removal from the platform and community\n\n**Enforcement Principles:**\n* Responses are proportional to the severity and frequency of violations\n* Context is considered — first-time minor violations are typically addressed with a warning\n* Repeated violations escalate consequences\n* Severe violations (threats, harassment, illegal activity) may result in immediate permanent ban\n* Appeals can be submitted to **legal@tuturuuu.com** within 30 days of enforcement action\n\n> We reserve the right to take action on behavior that violates the spirit of these guidelines, even if not explicitly listed.',
      ],
    ],
  },
  vi: {
    'acceptable-use': [
      [
        'Các hoạt động bị cấm',
        'Nghiêm cấm các hoạt động sau:\n\n1. **Hoạt động bất hợp pháp**\n   * Sử dụng Dịch vụ cho bất kỳ mục đích trái pháp luật nào hoặc để cổ xúy hoạt động bất hợp pháp\n   * Rửa tiền, gian lận hoặc tội phạm tài chính\n   * Phân phối nội dung hoặc tài liệu bất hợp pháp\n\n2. **Lạm dụng và quấy rối**\n   * Quấy rối, theo dõi, đe dọa hoặc uy hiếp bất kỳ cá nhân nào\n   * Doxing — công bố thông tin riêng tư của người khác khi chưa được đồng ý\n   * Hành vi giả mạo có phối hợp hoặc chiến dịch thao túng\n\n3. **Hoạt động kỹ thuật độc hại**\n   * Phát tán mã độc, virus hoặc phần mềm gây hại khác\n   * Cố gắng truy cập trái phép vào tài khoản, hệ thống hoặc dữ liệu\n   * Thực hiện tấn công từ chối dịch vụ hoặc gây gián đoạn mạng\n   * Khai thác lỗ hổng mà không công bố có trách nhiệm (xem [Điều khoản dịch vụ](/terms))\n\n4. **Hành vi lừa dối**\n   * Lừa đảo trực tuyến (phishing), thao túng tâm lý hoặc mạo danh\n   * Tạo tài khoản giả hoặc làm tăng chỉ số một cách giả tạo\n   * Lan truyền thông tin sai lệch hoặc thông tin gây hiểu lầm trên quy mô lớn\n\n5. **Vi phạm nội dung**\n   * Nội dung lạm dụng tình dục trẻ em (CSAM) — được báo cáo ngay cho cơ quan chức năng\n   * Nội dung liên quan đến khủng bố hoặc cổ xúy tư tưởng cực đoan\n   * Hình ảnh thân mật không có sự đồng ý\n   * Deepfake hoặc phương tiện tổng hợp gây hiểu lầm (xem mục tính năng AI bên dưới)',
      ],
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
        'Tính năng AI và giới hạn độ tuổi',
        'Tuturuuu tích hợp các tính năng AI trên toàn nền tảng. Khi sử dụng công cụ AI, bạn phải:\n\n1. **Trình bày trung thực**\n   * Không trình bày nội dung do AI tạo ra như thể hoàn toàn do con người tạo khi việc ghi nguồn là quan trọng\n   * Minh bạch với nhóm của bạn về việc có hỗ trợ của AI khi liên quan\n   * Hiểu rằng đầu ra của AI có thể có lỗi và cần được rà soát\n\n2. **Các cách dùng AI bị cấm**\n   * Tạo nội dung có hại, lừa dối hoặc bất hợp pháp\n   * Cố gắng vượt qua bộ lọc an toàn hoặc kiểm duyệt nội dung\n   * Dùng tính năng AI để quấy rối, mạo danh hoặc lừa dối người khác\n   * Tạo deepfake hoặc phương tiện tổng hợp gây hiểu lầm\n   * Tạo nội dung hàng loạt tự động nhằm gửi thư rác hoặc thao túng\n\n3. **Giới hạn độ tuổi**\n   * Tính năng AI chỉ dành cho người dùng **từ đủ 18 tuổi trở lên**\n   * Không chia sẻ quyền truy cập tính năng AI với người chưa đủ 18 tuổi',
      ],
      [
        'Nghiên cứu và báo cáo bảo mật',
        'Báo cáo riêng lỗ hổng nghi ngờ đến security@tuturuuu.com kèm dịch vụ và bước tái hiện. Không truy cập tenant khác, lấy dữ liệu cá nhân, kiểm thử tải gây gián đoạn hoặc duy trì truy cập khi chưa được cho phép bằng văn bản. Dừng nếu kiểm thử làm lộ dữ liệu người khác. Báo cáo lỗ hổng không cấp quyền kiểm thử không giới hạn.',
      ],
      [
        'Thực thi và xem xét',
        'Tuturuuu có thể giới hạn yêu cầu, dừng tác vụ, hạn chế tính năng hoặc đình chỉ tài khoản để xử lý lạm dụng, bảo mật, không thanh toán hoặc nghĩa vụ pháp luật. Khi có thể, biện pháp tương xứng, có thông báo và kênh xem xét tại legal@tuturuuu.com. Cung cấp mã tài khoản hoặc không gian và thời điểm; không gửi mật khẩu hay thông tin thẻ. Quyền pháp lý bắt buộc vẫn được giữ.',
      ],
      [
        'Xử lý theo mức độ, hành động ngay lập tức và kháng nghị',
        'Vi phạm Chính sách sử dụng chấp nhận được này có thể dẫn đến:\n\n1. **Xử lý theo mức độ**\n   * **Thông báo** — thông báo về vi phạm kèm hướng dẫn khắc phục\n   * **Hạn chế tính năng** — tạm thời giới hạn một số tính năng (ví dụ: quyền dùng AI, quyền dùng API)\n   * **Đình chỉ tài khoản** — tạm thời đình chỉ quyền truy cập tài khoản\n   * **Chấm dứt tài khoản** — gỡ bỏ vĩnh viễn khỏi nền tảng\n\n2. **Hành động ngay lập tức**\n   * Vi phạm nghiêm trọng (nội dung bất hợp pháp, tấn công đang diễn ra, CSAM) dẫn đến chấm dứt tài khoản ngay lập tức và có thể được báo cáo cho cơ quan thực thi pháp luật\n   * Tài khoản liên quan đến mối đe dọa bảo mật đang diễn ra có thể bị đình chỉ mà không cần báo trước\n\n3. **Kháng nghị**\n   * Bạn có thể kháng nghị quyết định xử lý bằng cách liên hệ **legal@tuturuuu.com** trong vòng 30 ngày\n   * Kháng nghị được xem xét bởi một thành viên nhóm không tham gia quyết định ban đầu\n   * Chúng tôi cố gắng phản hồi kháng nghị trong vòng 10 ngày làm việc',
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
        'Trách nhiệm khi dùng AI',
        'Tuturuuu tích hợp các tính năng AI trên toàn nền tảng. Khi sử dụng công cụ AI, bạn phải:\n\n1. **Trình bày trung thực**\n   * Không trình bày nội dung do AI tạo ra như thể hoàn toàn do con người tạo khi việc ghi nguồn là quan trọng\n   * Minh bạch với nhóm của bạn về việc có hỗ trợ của AI khi liên quan\n   * Hiểu rằng đầu ra của AI có thể có lỗi và cần được rà soát\n\n2. **Các cách dùng AI bị cấm**\n   * Tạo nội dung có hại, lừa dối hoặc bất hợp pháp\n   * Cố gắng vượt qua bộ lọc an toàn hoặc kiểm duyệt nội dung\n   * Dùng tính năng AI để quấy rối, mạo danh hoặc lừa dối người khác\n   * Tạo deepfake hoặc phương tiện tổng hợp gây hiểu lầm\n   * Tạo nội dung hàng loạt tự động nhằm gửi thư rác hoặc thao túng\n\n3. **Giới hạn độ tuổi**\n   * Tính năng AI chỉ dành cho người dùng **từ đủ 18 tuổi trở lên**\n   * Không chia sẻ quyền truy cập tính năng AI với người chưa đủ 18 tuổi\n\nXem thêm tại [Chính sách sử dụng chấp nhận được](/acceptable-use).',
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
      [
        'Các bước xử lý và kháng nghị',
        'Vi phạm Nguyên tắc cộng đồng này có thể dẫn đến các hành động sau, tùy mức độ nghiêm trọng:\n\n1. **Cảnh báo** — thông báo riêng giải thích vi phạm và hành vi cần khắc phục\n2. **Gỡ nội dung** — gỡ nội dung vi phạm khỏi nền tảng\n3. **Đình chỉ tạm thời** — tạm thời hạn chế quyền truy cập tài khoản\n4. **Cấm vĩnh viễn** — gỡ bỏ vĩnh viễn khỏi nền tảng và cộng đồng\n\n**Nguyên tắc xử lý:**\n* Biện pháp tương xứng với mức độ nghiêm trọng và tần suất vi phạm\n* Có xem xét bối cảnh — vi phạm nhẹ lần đầu thường chỉ bị cảnh báo\n* Vi phạm lặp lại sẽ bị xử lý nặng hơn\n* Vi phạm nghiêm trọng (đe dọa, quấy rối, hoạt động bất hợp pháp) có thể bị cấm vĩnh viễn ngay lập tức\n* Có thể gửi kháng nghị đến **legal@tuturuuu.com** trong vòng 30 ngày kể từ ngày bị xử lý\n\n> Chúng tôi có quyền xử lý hành vi trái với tinh thần của các nguyên tắc này, kể cả khi không được liệt kê rõ.',
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
        ? 'Chính sách'
        : 'Acceptable Use'
      : vi
        ? 'Nguyên tắc'
        : 'Community';
  const sections = policies[language][kind].map(
    ([heading, content], index) => ({
      id: `${kind}-proposal-${index + 1}`,
      title: heading,
      content,
      icon: 'shield' as const,
      tone: 'blue' as const,
    })
  );
  return {
    kind,
    locale: language,
    title,
    highlightedWord:
      kind === 'acceptable-use'
        ? vi
          ? 'sử dụng chấp nhận được'
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
    summaryTitle: vi
      ? 'Tổng quan'
      : kind === 'community-guidelines'
        ? 'Guidelines at a Glance'
        : 'At a glance',
    summaryDescription: vi
      ? 'Bản tóm tắt không thay thế toàn bộ chính sách.'
      : 'This summary does not replace the complete policy.',
    summaryRows: sections
      .slice(0, 3)
      .map((section) => ({ topic: section.title, summary: section.content })),
    sections,
  };
}
