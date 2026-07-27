import type {
  ArchivedLegalVersion,
  LegalDocument,
  LegalDocumentKind,
  LegalLocale,
} from './types';

const EFFECTIVE_DATE = '2026-08-15';
const PUBLISHED_DATE = '2026-07-27';
const VERSION = '2026-08-15';

const privacyEn: LegalDocument = {
  badge: 'Privacy & Data',
  effectiveDate: EFFECTIVE_DATE,
  footer:
    'Questions and rights requests may be sent to privacy@tuturuuu.com. This draft requires legal review before production publication.',
  highlightedWord: 'Policy',
  kind: 'privacy',
  locale: 'en',
  publishedDate: PUBLISHED_DATE,
  reviewRequired: true,
  sections: [
    {
      content: `This Privacy Policy applies to the public Tuturuuu service portfolio: workspace collaboration; tasks and projects; calendars; contacts, CRM, attendance, reports and posts; chat, mail, meetings and drive; documents, CMS, forms and short links; finance, billing and payments; inventory, storefront, POS and promotions; time tracking; teaching and learning; AI products; APIs, CLI, integrations and developer tooling. Internal administration systems support service operations and are not separately offered products.

**Tuturuuu JSC** acts as controller for account, billing, security, product analytics and direct commercial relationship data. For customer content processed under a workspace administrator's instructions, Tuturuuu ordinarily acts as processor or service provider. Workspace administrators determine who may join, what data is uploaded, access roles, integrations, retention settings and lawful notices to their users.`,
      icon: 'shield',
      title: 'Scope, roles, and workspace responsibility',
      tone: 'purple',
    },
    {
      content: `We may process account and profile details; workspace membership, roles and invitations; customer content and files; communications; contacts and attendance; financial, inventory, transaction and billing records; calendar and integration data; device, IP, cookie and security signals; support messages; API and key metadata; AI prompts, outputs, embeddings, images, agent steps, evaluation data and usage records.

Purposes include providing and securing the Services, authenticating users, completing transactions, operating integrations, customer support, reliability, fraud prevention, legal compliance and product improvement. Legal bases depend on context and jurisdiction and may include contract performance, legitimate interests, consent, legal obligation, and protection of vital or legal interests.`,
      icon: 'file',
      title: 'Data categories, purposes, and legal bases',
      tone: 'blue',
    },
    {
      content: `Customer content is retained while the workspace or account is active and as configured by the customer. Deleted service data may persist in encrypted backups for a limited rotation period. Security and abuse logs are retained according to risk and operational need. Billing and tax records may be retained for statutory periods. Legal holds override ordinary deletion.

AI request metadata is retained for **365 days by default**. Prompt, output, tool-argument and tool-result capture is **off by default**; when a workspace explicitly enables it, captured AI content is retained for **30 days by default**. Workspace controls or enterprise terms may shorten or extend applicable periods. Aggregated or de-identified statistics may be retained where they no longer identify a person.`,
      icon: 'clock',
      title: 'Retention, deletion, and export',
      tone: 'amber',
    },
    {
      content: `Tuturuuu uses access controls, encryption in transit, secret hashing, audit trails, tenant isolation, least-privilege operations, monitoring, incident response and secure development practices. No system is perfectly secure.

Data may be processed in countries where Tuturuuu or subprocessors operate. Where required, Tuturuuu uses recognized transfer mechanisms and supplementary safeguards. The maintained [Subprocessor Registry](/legal/subprocessors) lists purpose, data categories, regions and privacy information.`,
      icon: 'lock',
      title: 'Security, transfers, and subprocessors',
      tone: 'emerald',
    },
    {
      content: `Tuturuuu does **not** use customer prompts, outputs, files or evaluation datasets for general-purpose model training by default. Applicable no-training or data-control settings are propagated to supported providers. AI features can produce inaccurate, incomplete or biased output and may involve automated processing, but customers remain responsible for consequential decisions and appropriate human review.

We do not sell personal information or share it for cross-context behavioral advertising, subject to final provider and advertising-technology audit before publication. Optional integrations process data under their own terms and are enabled by users or workspace administrators.`,
      icon: 'code',
      title: 'AI, automated processing, and integrations',
      tone: 'cyan',
    },
    {
      content: `Depending on location and applicable thresholds or exemptions, individuals may request access, correction, deletion, portability, restriction, objection, withdrawal of consent, or appeal. Rights under Vietnam's Decree 13/2023, the GDPR and UK GDPR, and applicable United States state laws—including California access, correction, deletion, portability, opt-out and non-discrimination rights—apply only to the extent the relevant law governs the processing.

Users should normally contact their workspace administrator first for customer-controlled content. Tuturuuu will assist controllers under the DPA. The Services are not directed to children below the minimum lawful age; administrators and guardians must obtain required consent, and AI features may have higher age restrictions.`,
      icon: 'scale',
      title: 'Regional rights, children, and requests',
      tone: 'indigo',
    },
  ],
  summaryDescription:
    'A concise overview of how Tuturuuu handles account, workspace, commerce, integration, and AI data.',
  summaryRows: [
    {
      topic: 'Roles',
      summary:
        'Controller for direct relationships; processor for workspace content.',
    },
    {
      topic: 'AI',
      summary: 'No general-purpose training on customer content by default.',
    },
    {
      topic: 'Retention',
      summary: 'Category-specific periods, not a blanket deletion promise.',
    },
    {
      topic: 'Choices',
      summary: 'Workspace controls plus jurisdiction-qualified privacy rights.',
    },
  ],
  summaryTitle: 'Privacy at a glance',
  title: 'Privacy',
  version: VERSION,
};

const termsEn: LegalDocument = {
  badge: 'Service Agreement',
  effectiveDate: EFFECTIVE_DATE,
  footer:
    'These Terms are a counsel-review draft. Enterprise order forms and mandatory consumer law may add or override terms.',
  highlightedWord: 'Service',
  kind: 'terms',
  locale: 'en',
  publishedDate: PUBLISHED_DATE,
  reviewRequired: true,
  sections: [
    {
      content: `These Terms govern the complete public Tuturuuu service portfolio described in the [Privacy Policy](/privacy). You represent that you can accept them for yourself or your organization. Workspace administrators control invitations, roles, member defaults, guest access and customer content, and must have authority and a lawful basis to administer their workspace.

You retain ownership of customer content and grant Tuturuuu a limited license to host, process, transmit, back up and display it only as needed to provide, secure and improve the Services. You are responsible for content, permissions, notices, exports and the conduct of users you invite.`,
      icon: 'users',
      title: 'Authority, workspaces, invitations, and content',
      tone: 'purple',
    },
    {
      content: `You must protect credentials, API keys and devices; follow published limits and acceptable-use rules; and not attempt unauthorized access, unlawful surveillance, spam, abuse, malware, credential harvesting, safety-control bypass, model extraction or interference with the Services. AI-only \`ttr_ai_\` keys authorize only documented AI endpoints and never non-AI Tuturuuu APIs.

Integrations and curated agent tools access only capabilities explicitly approved by the user or administrator. Arbitrary HTTP requests, undeclared workspace access and unapproved code execution are prohibited. Third-party services remain subject to their own terms.`,
      icon: 'lock',
      title: 'APIs, keys, acceptable use, and integrations',
      tone: 'blue',
    },
    {
      content: `Plans, included seats, quotas and prices are shown at purchase or in an order form. Applicable taxes may be added. Subscriptions renew for the selected period until cancelled; cancellation stops future renewal but ordinarily does not refund elapsed service unless required by law or stated in an order form.

AI credits are usage units, not currency, and may expire or be limited by plan. Reservations, provider usage, streaming and billable failures may consume credits as disclosed. Previews can change or end. Tuturuuu may enforce rate, storage, model, retention and usage quotas.`,
      icon: 'credit-card',
      title: 'Plans, taxes, renewals, cancellation, and AI credits',
      tone: 'emerald',
    },
    {
      content: `AI and generated output may be inaccurate, incomplete, offensive, non-unique or unsuitable. You must evaluate outputs, preserve human oversight and obtain rights needed for inputs and intended uses. Tuturuuu does not guarantee ownership, non-infringement or fitness of generated output.

Prompt, agent and evaluation versions may be immutable for reproducibility. Agent tools must be reviewed before activation. Evaluation graders consume credits like other model calls. High-impact decisions require qualified human review and compliance with applicable law.`,
      icon: 'code',
      title: 'AI output, agents, evaluations, and previews',
      tone: 'cyan',
    },
    {
      content: `Tuturuuu may suspend or limit access to address security threats, abuse, non-payment, legal requirements, material breach or risk to the Services. Where practicable, notice and an opportunity to cure will be provided. Customers should export data before termination; export and deletion remain subject to technical limits, backup rotation, legal holds and the DPA.

Each party retains its pre-existing intellectual property. Confidential information must be protected with reasonable care and used only for the relationship. Feedback may be used without restriction if it does not identify confidential customer information.`,
      icon: 'database',
      title: 'Suspension, export, intellectual property, and confidentiality',
      tone: 'orange',
    },
    {
      content: `To the maximum extent permitted by law, Services are provided “as is” and “as available”; implied warranties are disclaimed. Neither party is liable for indirect, special, incidental, punitive or consequential damages, and aggregate liability is limited to amounts paid for the affected Services during the prior twelve months, except where a different limit is required by law or an enterprise order.

You will indemnify Tuturuuu for third-party claims arising from unlawful customer content, misuse or breach, subject to control-of-defense and cooperation procedures. Nothing excludes liability that cannot lawfully be excluded, limits mandatory consumer rights, or prevents remedies for fraud, wilful misconduct, death, personal injury or other protected claims.`,
      icon: 'scale',
      title: 'Warranties, liability, indemnity, and consumer rights',
      tone: 'rose',
    },
  ],
  summaryDescription:
    'The rules for accounts, workspaces, paid plans, APIs, AI features, and customer responsibilities.',
  summaryRows: [
    {
      topic: 'Workspace',
      summary: 'Admins control membership, access, and content.',
    },
    {
      topic: 'Usage',
      summary: 'Protect keys and follow limits and acceptable use.',
    },
    {
      topic: 'AI',
      summary: 'Outputs require review and credits reflect actual usage.',
    },
    {
      topic: 'Law',
      summary: 'Mandatory consumer protections continue to apply.',
    },
  ],
  summaryTitle: 'Terms at a glance',
  title: 'Terms of',
  version: VERSION,
};

const dpaEn: LegalDocument = {
  badge: 'Data Protection',
  effectiveDate: EFFECTIVE_DATE,
  footer:
    'The DPA forms part of an applicable customer agreement when Tuturuuu processes personal data on the customer’s behalf.',
  highlightedWord: 'Addendum',
  kind: 'dpa',
  locale: 'en',
  publishedDate: PUBLISHED_DATE,
  reviewRequired: true,
  sections: [
    {
      content: `The customer is controller and Tuturuuu is processor for personal data submitted to a workspace, except where each acts as an independent controller. Tuturuuu processes data only on documented instructions in the agreement, product configuration, support requests and lawful customer directions. Processing supports the service categories disclosed in the Privacy Policy for the agreement term and applicable retention period.`,
      icon: 'file',
      title: 'Scope, roles, and instructions',
      tone: 'purple',
    },
    {
      content: `Personnel authorized to process personal data are bound by confidentiality. Tuturuuu maintains safeguards appropriate to risk, including access control, encryption, tenant isolation, monitoring, secure development, incident response, resilience and recovery measures. The customer remains responsible for lawful collection, notices, permissions, endpoint security and configuration.`,
      icon: 'lock',
      title: 'Confidentiality and safeguards',
      tone: 'emerald',
    },
    {
      content: `The customer generally authorizes the subprocessors in the maintained [registry](/legal/subprocessors). Tuturuuu will provide notice of material additions where contractually required and a reasonable objection process. International transfers use applicable legal mechanisms, including recognized contractual clauses and supplementary measures where required.`,
      icon: 'globe',
      title: 'Subprocessors and international transfers',
      tone: 'blue',
    },
    {
      content: `Tuturuuu will notify the customer without undue delay after confirming a personal data breach affecting customer data, consistent with legal and security constraints. Tuturuuu will reasonably assist with data-subject requests, impact assessments and regulatory consultation, taking account of processing nature and available information.`,
      icon: 'bell',
      title: 'Incidents and data-subject assistance',
      tone: 'orange',
    },
    {
      content: `Upon reasonable request, Tuturuuu will provide information needed to demonstrate compliance. Audits must protect other customers, security and confidentiality and ordinarily begin with independent reports or written evidence. On termination, customer data is returned or deleted according to product export capabilities, backup rotation, legal retention and documented instructions.`,
      icon: 'scale',
      title: 'Audits, return, and deletion',
      tone: 'indigo',
    },
  ],
  summaryDescription:
    'Processor commitments for customer-controlled personal data.',
  summaryRows: [
    {
      topic: 'Instructions',
      summary: 'Processing follows documented customer directions.',
    },
    {
      topic: 'Security',
      summary: 'Risk-based technical and organizational safeguards.',
    },
    { topic: 'Support', summary: 'Incident and rights-request assistance.' },
    {
      topic: 'Exit',
      summary: 'Return or deletion subject to backups and law.',
    },
  ],
  summaryTitle: 'DPA at a glance',
  title: 'Data Processing',
  version: VERSION,
};

const slaEn: LegalDocument = {
  badge: 'Reliability',
  effectiveDate: EFFECTIVE_DATE,
  footer:
    'No numerical uptime commitment or service credit applies unless an enterprise order form expressly activates it.',
  highlightedWord: 'Agreement',
  kind: 'sla',
  locale: 'en',
  publishedDate: PUBLISHED_DATE,
  reviewRequired: true,
  sections: [
    {
      content: `This SLA is contractual-only. “Available” means the covered production service can accept and process ordinary requests, excluding scheduled maintenance and exclusions below. Measurement method, covered services, uptime target and credit schedule apply only when an enterprise order form expressly activates them.`,
      icon: 'server',
      title: 'Definitions and activation',
      tone: 'purple',
    },
    {
      content: `Downtime excludes previews, free tiers, customer configuration, third-party providers outside Tuturuuu control, internet or device failure, force majeure, abuse, suspension, emergency security work and announced maintenance. Tuturuuu communicates material incidents through available status and support channels and prioritizes restoration and accurate post-incident review.`,
      icon: 'bell',
      title: 'Exclusions, incidents, and maintenance',
      tone: 'orange',
    },
    {
      content: `When activated, the order form specifies credit tiers and maximum credit. Credits are the sole contractual SLA remedy, are applied to future invoices, cannot exceed affected recurring fees and are not cash. Claims must be submitted by an authorized customer contact within 30 days with dates, impact and supporting request identifiers. Tuturuuu will validate measurements in good faith.`,
      icon: 'credit-card',
      title: 'Credits and claim procedure',
      tone: 'emerald',
    },
  ],
  summaryDescription:
    'Reliability definitions and claim mechanics for enterprise agreements.',
  summaryRows: [
    { topic: 'Default', summary: 'No public numerical uptime promise.' },
    {
      topic: 'Activation',
      summary: 'Targets require an enterprise order form.',
    },
    {
      topic: 'Credits',
      summary: 'Future-invoice credits are the contractual remedy.',
    },
    { topic: 'Claims', summary: 'Authorized claims are due within 30 days.' },
  ],
  summaryTitle: 'SLA at a glance',
  title: 'Service Level',
  version: VERSION,
};

const subprocessorsEn: LegalDocument = {
  badge: 'Trust Center',
  effectiveDate: EFFECTIVE_DATE,
  footer:
    'The registry is maintained as providers change. Customers with contractual notice rights receive applicable material-change notices.',
  highlightedWord: 'Registry',
  kind: 'subprocessors',
  locale: 'en',
  publishedDate: PUBLISHED_DATE,
  reviewRequired: true,
  sections: [
    {
      content: `Tuturuuu uses vetted providers to host, secure, communicate, bill, observe and optionally power integrations or AI. A provider receives only data appropriate to the enabled purpose. The current registry includes **Supabase, Vercel, Cloudflare, OpenAI, Google Cloud, Microsoft, Polar, Resend, and Sentry**.

For each provider, Tuturuuu maintains its purpose, data categories, operating regions, privacy link and change date in the canonical registry used by product and legal coverage tests. Provider use varies by customer configuration and selected integrations.`,
      icon: 'server',
      title: 'Maintained provider registry',
      tone: 'blue',
    },
    {
      content: `AI model providers are engaged only when a workspace uses an enabled model. Integration providers are engaged only when users connect or invoke the integration. Tuturuuu evaluates contractual, privacy and security controls and propagates supported no-training and retention options. Customers may contact privacy@tuturuuu.com for current transfer information or contractual objection procedures.`,
      icon: 'shield',
      title: 'Conditional providers and changes',
      tone: 'emerald',
    },
  ],
  summaryDescription:
    'Providers that may process data to deliver Tuturuuu services.',
  summaryRows: [
    {
      topic: 'Minimum access',
      summary: 'Providers receive purpose-limited data.',
    },
    {
      topic: 'Conditional use',
      summary: 'AI and integrations run only when enabled.',
    },
    {
      topic: 'Changes',
      summary: 'Material changes follow contractual notice rights.',
    },
    {
      topic: 'Details',
      summary: 'Purpose, data, regions, links, and dates are maintained.',
    },
  ],
  summaryTitle: 'Subprocessors at a glance',
  title: 'Subprocessor',
  version: VERSION,
};

function translateDocument(document: LegalDocument): LegalDocument {
  const translations: Record<
    LegalDocumentKind,
    Pick<
      LegalDocument,
      | 'badge'
      | 'footer'
      | 'highlightedWord'
      | 'summaryDescription'
      | 'summaryTitle'
      | 'title'
    >
  > = {
    privacy: {
      badge: 'Quyền riêng tư & Dữ liệu',
      footer:
        'Gửi câu hỏi hoặc yêu cầu về quyền dữ liệu đến privacy@tuturuuu.com. Bản dự thảo này cần được rà soát pháp lý trước khi công bố.',
      highlightedWord: 'Riêng tư',
      summaryDescription:
        'Tổng quan về cách Tuturuuu xử lý dữ liệu tài khoản, không gian làm việc, thương mại, tích hợp và AI.',
      summaryTitle: 'Tóm tắt quyền riêng tư',
      title: 'Chính sách',
    },
    terms: {
      badge: 'Thỏa thuận dịch vụ',
      footer:
        'Điều khoản này là bản dự thảo chờ rà soát pháp lý. Đơn đặt hàng doanh nghiệp và luật bảo vệ người tiêu dùng bắt buộc có thể bổ sung hoặc thay thế.',
      highlightedWord: 'Dịch vụ',
      summaryDescription:
        'Quy tắc cho tài khoản, không gian làm việc, gói trả phí, API và tính năng AI.',
      summaryTitle: 'Tóm tắt điều khoản',
      title: 'Điều khoản',
    },
    dpa: {
      badge: 'Bảo vệ dữ liệu',
      footer:
        'DPA là một phần của thỏa thuận khách hàng áp dụng khi Tuturuuu xử lý dữ liệu cá nhân thay mặt khách hàng.',
      highlightedWord: 'Dữ liệu',
      summaryDescription:
        'Cam kết của bên xử lý đối với dữ liệu cá nhân do khách hàng kiểm soát.',
      summaryTitle: 'Tóm tắt DPA',
      title: 'Phụ lục xử lý',
    },
    sla: {
      badge: 'Độ tin cậy',
      footer:
        'Không có cam kết thời gian hoạt động hoặc tín dụng dịch vụ nếu đơn đặt hàng doanh nghiệp không kích hoạt rõ ràng.',
      highlightedWord: 'Dịch vụ',
      summaryDescription:
        'Định nghĩa độ tin cậy và cơ chế yêu cầu cho thỏa thuận doanh nghiệp.',
      summaryTitle: 'Tóm tắt SLA',
      title: 'Thỏa thuận mức',
    },
    subprocessors: {
      badge: 'Trung tâm tin cậy',
      footer:
        'Danh mục được duy trì khi nhà cung cấp thay đổi. Khách hàng có quyền thông báo theo hợp đồng sẽ nhận thông báo phù hợp.',
      highlightedWord: 'Xử lý phụ',
      summaryDescription:
        'Các nhà cung cấp có thể xử lý dữ liệu để cung cấp dịch vụ Tuturuuu.',
      summaryTitle: 'Tóm tắt bên xử lý phụ',
      title: 'Danh mục bên',
    },
  };
  const translated = translations[document.kind];
  const sectionTranslations: Record<
    LegalDocumentKind,
    Array<{ content: string; title: string }>
  > = {
    privacy: [
      {
        title: 'Phạm vi, vai trò và trách nhiệm không gian làm việc',
        content: `Chính sách này áp dụng cho toàn bộ dịch vụ công khai của Tuturuuu: cộng tác không gian làm việc; công việc và dự án; lịch; liên hệ, CRM, điểm danh, báo cáo và bài đăng; trò chuyện, thư, họp và lưu trữ; tài liệu, CMS, biểu mẫu và liên kết rút gọn; tài chính, thanh toán; kho, cửa hàng, POS và khuyến mãi; theo dõi thời gian; dạy và học; AI; API, CLI, tích hợp và công cụ nhà phát triển. Hệ thống quản trị nội bộ chỉ hỗ trợ vận hành dịch vụ.

**Công ty Cổ phần Tuturuuu** là bên kiểm soát dữ liệu tài khoản, thanh toán, bảo mật, phân tích sản phẩm và quan hệ thương mại trực tiếp. Với nội dung do khách hàng đưa vào không gian làm việc, Tuturuuu thường là bên xử lý dữ liệu theo chỉ dẫn của quản trị viên. Quản trị viên quyết định thành viên, dữ liệu tải lên, quyền truy cập, tích hợp, thời hạn lưu giữ và thông báo pháp lý cho người dùng.`,
      },
      {
        title: 'Loại dữ liệu, mục đích và căn cứ pháp lý',
        content: `Chúng tôi có thể xử lý thông tin tài khoản và hồ sơ; thành viên, vai trò và lời mời; nội dung và tệp của khách hàng; liên lạc; danh bạ và điểm danh; dữ liệu tài chính, kho, giao dịch và thanh toán; lịch và tích hợp; thiết bị, IP, cookie và tín hiệu bảo mật; yêu cầu hỗ trợ; siêu dữ liệu API và khóa; lời nhắc, đầu ra, embedding, hình ảnh, bước agent, dữ liệu đánh giá và mức sử dụng AI.

Mục đích gồm cung cấp và bảo vệ Dịch vụ, xác thực, xử lý giao dịch, vận hành tích hợp, hỗ trợ, độ tin cậy, chống gian lận, tuân thủ pháp luật và cải tiến sản phẩm. Căn cứ pháp lý tùy bối cảnh và khu vực, có thể gồm thực hiện hợp đồng, lợi ích hợp pháp, đồng ý, nghĩa vụ pháp lý và bảo vệ quyền hoặc lợi ích thiết yếu.`,
      },
      {
        title: 'Lưu giữ, xóa và xuất dữ liệu',
        content: `Nội dung khách hàng được lưu khi tài khoản hoặc không gian làm việc còn hoạt động và theo cấu hình của khách hàng. Dữ liệu đã xóa có thể còn trong bản sao lưu mã hóa trong chu kỳ giới hạn. Nhật ký bảo mật được lưu theo rủi ro vận hành; chứng từ thanh toán và thuế theo thời hạn luật định; yêu cầu bảo toàn pháp lý được ưu tiên.

Siêu dữ liệu yêu cầu AI mặc định lưu **365 ngày**. Việc ghi lại lời nhắc, đầu ra, tham số và kết quả công cụ **mặc định tắt**; nếu được bật rõ ràng, nội dung AI mặc định lưu **30 ngày**. Cấu hình không gian làm việc hoặc thỏa thuận doanh nghiệp có thể điều chỉnh thời hạn.`,
      },
      {
        title: 'Bảo mật, chuyển dữ liệu và bên xử lý phụ',
        content: `Tuturuuu áp dụng kiểm soát truy cập, mã hóa khi truyền, băm bí mật, nhật ký kiểm toán, cô lập tenant, nguyên tắc tối thiểu quyền, giám sát, ứng phó sự cố và phát triển an toàn. Không hệ thống nào an toàn tuyệt đối.

Dữ liệu có thể được xử lý tại quốc gia nơi Tuturuuu hoặc bên xử lý phụ hoạt động. Khi cần, chúng tôi dùng cơ chế chuyển dữ liệu được công nhận và biện pháp bổ sung. [Danh mục bên xử lý phụ](/legal/subprocessors) duy trì mục đích, loại dữ liệu, khu vực và thông tin quyền riêng tư.`,
      },
      {
        title: 'AI, xử lý tự động và tích hợp',
        content: `Tuturuuu **không** dùng lời nhắc, đầu ra, tệp hoặc bộ dữ liệu đánh giá của khách hàng để huấn luyện mô hình đa mục đích theo mặc định. Các tùy chọn không huấn luyện và kiểm soát dữ liệu được chuyển tới nhà cung cấp có hỗ trợ. Đầu ra AI có thể sai, thiếu hoặc thiên lệch; khách hàng phải duy trì việc xem xét của con người.

Chúng tôi không bán thông tin cá nhân hoặc chia sẻ cho quảng cáo hành vi xuyên bối cảnh, với điều kiện tuyên bố này được xác nhận trong kiểm toán cuối cùng về nhà cung cấp và công nghệ quảng cáo. Tích hợp tùy chọn chịu điều khoản riêng và chỉ chạy khi người dùng hoặc quản trị viên bật.`,
      },
      {
        title: 'Quyền theo khu vực, trẻ em và yêu cầu',
        content: `Tùy nơi cư trú, ngưỡng áp dụng và ngoại lệ, cá nhân có thể yêu cầu truy cập, sửa, xóa, chuyển, hạn chế, phản đối, rút đồng ý hoặc khiếu nại. Quyền theo Nghị định 13/2023 của Việt Nam, GDPR/UK GDPR và luật tiểu bang Hoa Kỳ áp dụng—bao gồm California—chỉ trong phạm vi luật tương ứng điều chỉnh hoạt động xử lý.

Với nội dung do khách hàng kiểm soát, người dùng thường nên liên hệ quản trị viên trước. Tuturuuu hỗ trợ bên kiểm soát theo DPA. Dịch vụ không hướng tới trẻ dưới độ tuổi hợp pháp tối thiểu; quản trị viên và người giám hộ phải có đồng ý cần thiết, và tính năng AI có thể yêu cầu độ tuổi cao hơn.`,
      },
    ],
    terms: [
      {
        title: 'Thẩm quyền, không gian làm việc, lời mời và nội dung',
        content: `Điều khoản này điều chỉnh toàn bộ dịch vụ công khai được mô tả trong [Chính sách Quyền riêng tư](/privacy). Bạn xác nhận có quyền chấp nhận cho mình hoặc tổ chức. Quản trị viên kiểm soát lời mời, vai trò, quyền mặc định, khách và nội dung, đồng thời phải có thẩm quyền và căn cứ hợp pháp.

Bạn giữ quyền sở hữu nội dung khách hàng và cấp cho Tuturuuu giấy phép giới hạn để lưu trữ, xử lý, truyền, sao lưu và hiển thị nội dung chỉ nhằm cung cấp, bảo vệ và cải tiến Dịch vụ.`,
      },
      {
        title: 'API, khóa, sử dụng chấp nhận được và tích hợp',
        content: `Bạn phải bảo vệ thông tin đăng nhập, khóa API và thiết bị; tuân thủ giới hạn; không truy cập trái phép, giám sát bất hợp pháp, spam, phát tán mã độc, thu thập thông tin đăng nhập, vượt kiểm soát an toàn, trích xuất mô hình hoặc cản trở Dịch vụ. Khóa AI \`ttr_ai_\` chỉ cấp quyền cho endpoint AI được công bố.

Tích hợp và công cụ agent chỉ truy cập khả năng được phê duyệt rõ ràng. Yêu cầu HTTP tùy ý, truy cập không gian làm việc không khai báo và thực thi mã không được duyệt đều bị cấm.`,
      },
      {
        title: 'Gói, thuế, gia hạn, hủy và tín dụng AI',
        content: `Gói, số chỗ, hạn mức và giá được hiển thị lúc mua hoặc trong đơn đặt hàng; thuế có thể được cộng thêm. Đăng ký tự gia hạn theo kỳ đã chọn cho đến khi hủy. Việc hủy dừng lần gia hạn sau và thường không hoàn phần dịch vụ đã sử dụng, trừ khi pháp luật hoặc đơn đặt hàng quy định khác.

Tín dụng AI là đơn vị sử dụng, không phải tiền, và có thể hết hạn hoặc bị giới hạn theo gói. Dự phòng, mức dùng nhà cung cấp, streaming và lỗi có phát sinh chi phí có thể tiêu tín dụng như được công bố.`,
      },
      {
        title: 'Đầu ra AI, agent, đánh giá và bản xem trước',
        content: `Đầu ra AI có thể sai, thiếu, gây khó chịu, không độc nhất hoặc không phù hợp. Bạn phải đánh giá đầu ra, duy trì giám sát của con người và có quyền cần thiết đối với đầu vào và mục đích sử dụng. Tuturuuu không đảm bảo quyền sở hữu, không xâm phạm hoặc tính phù hợp của đầu ra.

Phiên bản lời nhắc, agent và đánh giá có thể bất biến để tái lập. Công cụ agent phải được rà soát trước khi kích hoạt; cuộc gọi chấm điểm đánh giá tiêu tín dụng như cuộc gọi mô hình khác.`,
      },
      {
        title: 'Tạm ngừng, xuất dữ liệu, sở hữu trí tuệ và bảo mật',
        content: `Tuturuuu có thể giới hạn hoặc tạm ngừng truy cập để xử lý đe dọa bảo mật, lạm dụng, không thanh toán, yêu cầu pháp lý, vi phạm nghiêm trọng hoặc rủi ro cho Dịch vụ. Khi khả thi, chúng tôi sẽ thông báo và cho cơ hội khắc phục.

Mỗi bên giữ tài sản trí tuệ có trước. Thông tin mật phải được bảo vệ hợp lý và chỉ dùng cho quan hệ giữa các bên. Việc xuất và xóa dữ liệu chịu giới hạn kỹ thuật, chu kỳ sao lưu, yêu cầu bảo toàn và DPA.`,
      },
      {
        title: 'Bảo đảm, trách nhiệm, bồi thường và quyền người tiêu dùng',
        content: `Trong phạm vi pháp luật cho phép, Dịch vụ được cung cấp “nguyên trạng” và “sẵn có”; các bảo đảm ngụ ý bị loại trừ. Không bên nào chịu thiệt hại gián tiếp, đặc biệt, ngẫu nhiên, trừng phạt hoặc hệ quả; tổng trách nhiệm giới hạn ở khoản đã trả cho Dịch vụ bị ảnh hưởng trong 12 tháng trước, trừ khi luật hoặc đơn đặt hàng quy định khác.

Bạn bồi thường cho Tuturuuu đối với khiếu nại bên thứ ba từ nội dung trái pháp luật, lạm dụng hoặc vi phạm. Không điều khoản nào loại trừ trách nhiệm không thể loại trừ hoặc hạn chế quyền người tiêu dùng bắt buộc.`,
      },
    ],
    dpa: [
      {
        title: 'Phạm vi, vai trò và chỉ dẫn',
        content: `Khách hàng là bên kiểm soát và Tuturuuu là bên xử lý đối với dữ liệu cá nhân đưa vào không gian làm việc, trừ trường hợp mỗi bên là bên kiểm soát độc lập. Tuturuuu chỉ xử lý theo chỉ dẫn được ghi nhận trong thỏa thuận, cấu hình sản phẩm, yêu cầu hỗ trợ và hướng dẫn hợp pháp của khách hàng.`,
      },
      {
        title: 'Bảo mật và biện pháp bảo vệ',
        content: `Nhân sự được phép xử lý dữ liệu bị ràng buộc bảo mật. Tuturuuu duy trì kiểm soát truy cập, mã hóa, cô lập tenant, giám sát, phát triển an toàn, ứng phó sự cố, khả năng phục hồi và khôi phục phù hợp với rủi ro. Khách hàng chịu trách nhiệm về thu thập hợp pháp, thông báo, quyền, bảo mật thiết bị và cấu hình.`,
      },
      {
        title: 'Bên xử lý phụ và chuyển dữ liệu quốc tế',
        content: `Khách hàng ủy quyền chung cho các bên trong [danh mục](/legal/subprocessors). Tuturuuu thông báo thay đổi trọng yếu và cung cấp quy trình phản đối hợp lý khi hợp đồng yêu cầu. Chuyển dữ liệu quốc tế sử dụng cơ chế pháp lý và biện pháp bổ sung thích hợp.`,
      },
      {
        title: 'Sự cố và hỗ trợ chủ thể dữ liệu',
        content: `Tuturuuu thông báo cho khách hàng không chậm trễ bất hợp lý sau khi xác nhận vi phạm dữ liệu cá nhân ảnh hưởng dữ liệu khách hàng, phù hợp giới hạn pháp lý và bảo mật. Chúng tôi hỗ trợ hợp lý với yêu cầu quyền dữ liệu, đánh giá tác động và tham vấn cơ quan quản lý.`,
      },
      {
        title: 'Kiểm toán, hoàn trả và xóa',
        content: `Theo yêu cầu hợp lý, Tuturuuu cung cấp thông tin cần thiết để chứng minh tuân thủ. Kiểm toán phải bảo vệ khách hàng khác, bảo mật và bí mật, và thường bắt đầu bằng báo cáo độc lập hoặc bằng chứng văn bản. Khi chấm dứt, dữ liệu được hoàn trả hoặc xóa theo khả năng xuất, chu kỳ sao lưu, nghĩa vụ pháp lý và chỉ dẫn.`,
      },
    ],
    sla: [
      {
        title: 'Định nghĩa và kích hoạt',
        content: `SLA này chỉ có hiệu lực theo hợp đồng. “Khả dụng” nghĩa là dịch vụ sản xuất thuộc phạm vi có thể nhận và xử lý yêu cầu thông thường, không tính bảo trì và ngoại lệ. Phương pháp đo, dịch vụ, mục tiêu uptime và mức tín dụng chỉ áp dụng khi đơn đặt hàng doanh nghiệp kích hoạt rõ ràng.`,
      },
      {
        title: 'Ngoại lệ, sự cố và bảo trì',
        content: `Thời gian gián đoạn không gồm bản xem trước, gói miễn phí, cấu hình khách hàng, nhà cung cấp ngoài kiểm soát, lỗi internet hoặc thiết bị, bất khả kháng, lạm dụng, tạm ngừng, công việc bảo mật khẩn cấp và bảo trì đã thông báo. Tuturuuu ưu tiên khôi phục và đánh giá sự cố chính xác.`,
      },
      {
        title: 'Tín dụng và thủ tục yêu cầu',
        content: `Khi được kích hoạt, đơn đặt hàng quy định mức và giới hạn tín dụng. Tín dụng chỉ dùng cho hóa đơn tương lai, không vượt phí định kỳ bị ảnh hưởng, không quy đổi tiền mặt và là biện pháp SLA duy nhất. Người liên hệ được ủy quyền phải gửi yêu cầu trong 30 ngày kèm thời gian, tác động và mã yêu cầu.`,
      },
    ],
    subprocessors: [
      {
        title: 'Danh mục nhà cung cấp được duy trì',
        content: `Tuturuuu dùng nhà cung cấp đã đánh giá để lưu trữ, bảo vệ, liên lạc, thanh toán, quan sát và tùy chọn hỗ trợ tích hợp hoặc AI. Nhà cung cấp chỉ nhận dữ liệu phù hợp với mục đích được bật. Danh mục hiện tại gồm **Supabase, Vercel, Cloudflare, OpenAI, Google Cloud, Microsoft, Polar, Resend và Sentry**.

Với mỗi nhà cung cấp, Tuturuuu duy trì mục đích, loại dữ liệu, khu vực hoạt động, liên kết quyền riêng tư và ngày thay đổi trong danh mục chuẩn được kiểm thử cùng sản phẩm.`,
      },
      {
        title: 'Nhà cung cấp có điều kiện và thay đổi',
        content: `Nhà cung cấp mô hình AI chỉ được dùng khi không gian làm việc gọi mô hình đã bật. Nhà cung cấp tích hợp chỉ được dùng khi người dùng kết nối hoặc gọi tích hợp. Tuturuuu đánh giá điều khoản, quyền riêng tư và bảo mật, đồng thời chuyển tiếp tùy chọn không huấn luyện và lưu giữ khi được hỗ trợ.`,
      },
    ],
  };
  const summaryTranslations: Record<
    LegalDocumentKind,
    LegalDocument['summaryRows']
  > = {
    privacy: [
      {
        topic: 'Vai trò',
        summary:
          'Bên kiểm soát quan hệ trực tiếp; bên xử lý nội dung không gian làm việc.',
      },
      {
        topic: 'AI',
        summary:
          'Mặc định không huấn luyện đa mục đích bằng nội dung khách hàng.',
      },
      {
        topic: 'Lưu giữ',
        summary: 'Thời hạn theo từng loại dữ liệu, không hứa xóa đồng loạt.',
      },
      {
        topic: 'Lựa chọn',
        summary: 'Cấu hình không gian làm việc và quyền theo khu vực.',
      },
    ],
    terms: [
      {
        topic: 'Không gian',
        summary: 'Quản trị viên kiểm soát thành viên, truy cập và nội dung.',
      },
      {
        topic: 'Sử dụng',
        summary: 'Bảo vệ khóa và tuân thủ giới hạn, quy tắc sử dụng.',
      },
      {
        topic: 'AI',
        summary: 'Đầu ra cần rà soát; tín dụng phản ánh mức dùng thực tế.',
      },
      {
        topic: 'Pháp luật',
        summary: 'Quyền người tiêu dùng bắt buộc vẫn được áp dụng.',
      },
    ],
    dpa: [
      {
        topic: 'Chỉ dẫn',
        summary: 'Xử lý theo hướng dẫn được ghi nhận của khách hàng.',
      },
      {
        topic: 'Bảo mật',
        summary: 'Biện pháp kỹ thuật và tổ chức dựa trên rủi ro.',
      },
      { topic: 'Hỗ trợ', summary: 'Hỗ trợ sự cố và yêu cầu quyền dữ liệu.' },
      {
        topic: 'Kết thúc',
        summary: 'Hoàn trả hoặc xóa theo sao lưu và pháp luật.',
      },
    ],
    sla: [
      {
        topic: 'Mặc định',
        summary: 'Không công bố cam kết uptime định lượng.',
      },
      {
        topic: 'Kích hoạt',
        summary: 'Mục tiêu cần đơn đặt hàng doanh nghiệp.',
      },
      {
        topic: 'Tín dụng',
        summary: 'Tín dụng hóa đơn tương lai là biện pháp hợp đồng.',
      },
      {
        topic: 'Yêu cầu',
        summary: 'Yêu cầu được ủy quyền phải gửi trong 30 ngày.',
      },
    ],
    subprocessors: [
      {
        topic: 'Tối thiểu',
        summary: 'Nhà cung cấp chỉ nhận dữ liệu theo mục đích.',
      },
      {
        topic: 'Có điều kiện',
        summary: 'AI và tích hợp chỉ chạy khi được bật.',
      },
      {
        topic: 'Thay đổi',
        summary: 'Thay đổi trọng yếu theo quyền thông báo hợp đồng.',
      },
      {
        topic: 'Chi tiết',
        summary: 'Duy trì mục đích, dữ liệu, khu vực, liên kết và ngày.',
      },
    ],
  };
  return {
    ...document,
    ...translated,
    locale: 'vi',
    sections: document.sections.map((section, index) => ({
      ...section,
      ...sectionTranslations[document.kind][index],
    })),
    summaryRows: summaryTranslations[document.kind],
  };
}

const englishDocuments = {
  dpa: dpaEn,
  privacy: privacyEn,
  sla: slaEn,
  subprocessors: subprocessorsEn,
  terms: termsEn,
} as const satisfies Record<LegalDocumentKind, LegalDocument>;

export const LEGAL_DOCUMENTS: Record<
  LegalLocale,
  Record<LegalDocumentKind, LegalDocument>
> = {
  en: englishDocuments,
  vi: {
    dpa: translateDocument(dpaEn),
    privacy: translateDocument(privacyEn),
    sla: translateDocument(slaEn),
    subprocessors: translateDocument(subprocessorsEn),
    terms: translateDocument(termsEn),
  },
};

export const ARCHIVED_LEGAL_VERSIONS: readonly ArchivedLegalVersion[] = [
  {
    effectiveDate: '2026-02-06',
    kind: 'privacy',
    locale: 'en',
    version: '2026-02-06',
  },
  {
    effectiveDate: '2025-01-01',
    kind: 'terms',
    locale: 'en',
    version: '2025-01-01',
  },
] as const;

export function getLegalDocument(
  kind: LegalDocumentKind,
  locale: string
): LegalDocument {
  return LEGAL_DOCUMENTS[locale === 'vi' ? 'vi' : 'en'][kind];
}
