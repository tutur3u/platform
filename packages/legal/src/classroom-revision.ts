import { getLegalDocument } from './documents';
import type { LegalDocument, LegalLocale } from './types';

export type ClassroomLegalKind = 'privacy' | 'terms' | 'dpa' | 'subprocessors';

const copy = {
  en: {
    privacy: [
      [
        'Classroom media and participant information',
        "When enabled, Meet Classroom processes participant account or guest identifiers, display names, connection metadata, audio/video, recordings, captions, transcripts and class interactions to provide the selected class features. Joining anonymously does not mean a connection leaves no technical metadata. Anonymous participation is available only on paid plans and consumes the same room capacity. Recording and captions/transcription require the applicable participant notice and consent; a plan subscription does not itself provide consent.\n\nClassroom students may be children. Where a student is below the age at which they can consent independently under applicable law, the school or workspace (the customer/controller) must obtain verifiable parent or guardian consent, and retain the child's own consent where the law also requires it, before recording, captions, transcription, AI or tab-switch telemetry. Read the general statement about services not directed to children below the minimum lawful age together with this classroom-specific provision: Meet Classroom may be used by schools for students who are minors under the customer's instructions and the guardian-consent requirements above.",
      ],
      [
        'AI, tab-switch telemetry and retention',
        "AI is off by default. A teacher may select assistance without direct answers or full AI for that class. The student disclosure must identify the selected mode and what class content is processed before use. Tab-switch telemetry is off unless the teacher turns it on. When enabled, disclose the collection of visibility/focus events and timestamps, the purpose, recipients and retention before collection. Such events are not proof of cheating. Easy Center protections continue to apply.\n\nRecordings, captions, transcripts, AI inputs/outputs and integrity telemetry have distinct access and retention needs. The enabled feature and workspace instructions identify the applicable retention and deletion controls. Ending a meeting is not a promise that stored artifacts or backups are immediately erased. Storage allowance is not a retention period. Applicable legal holds and backup deletion schedules must be explained; no unlimited retention or automatic deletion promise is made by these plan limits.\n\nTab-switch telemetry and full AI for children require guardian-aware notice and the consent described above. Handle children's data with the extra care required by applicable law.",
      ],
    ],
    terms: [
      [
        'Classroom controls, disclosure and appropriate use',
        'Hosts and teachers must provide the student disclosure before enabling recording, captions, transcription, AI or tab-switch telemetry, obtain the consent required for their use, and respect access restrictions and student rights. Teachers select AI off, assistance without direct answers, or full AI per class. Tab-switch events alone must not be treated as conclusive evidence of misconduct. Anonymous joining is limited to paid plans and never bypasses admission, capacity, consent or abuse controls. A Free host must use a verified @tuturuuu.com account.',
      ],
      [
        'Meet allowances and feature stops',
        'The approved Meet plan allowances are set out below. Full-AI minutes consume two allowance minutes for each minute of use. Reaching a feature allowance stops that feature; it does not authorize automatic paid overage, a price change, access escalation or deletion of stored customer content. A teacher may set a lower room maximum; the plan cap and platform ceiling of 100 still apply. Prices and commercial changes remain subject to the applicable checkout or signed agreement. The table is a plan policy, not a statement that every listed feature is already enabled.',
      ],
    ],
    dpa: [
      [
        'Classroom processing instructions',
        "For customer-controlled classes, processing instructions cover connection and participant identity metadata, live media, recordings, captions, transcripts, optional AI inputs/outputs and optional tab-switch events. The customer determines lawful purposes, student notices, required permissions and who may access artifacts. Tuturuuu processes customer content to deliver the enabled features under those instructions. Anonymous participants remain data subjects; technical identifiers must not be described as untraceable or inherently non-personal.\n\nFor minor students, the customer is responsible for the lawful basis and guardian consent, including the child's own consent when applicable law requires it. Tuturuuu processes that data only on those lawful instructions.",
      ],
      [
        'Controls, retention and feature limits',
        'AI is default-off and configured per class; tab-switch collection requires teacher opt-in and prior student disclosure. Apply access, deletion and retention instructions separately to live sessions, stored media, transcripts, AI artifacts and telemetry, including provider and backup copies. Identify any retention or deletion exception and its permitted purpose. A plan cap stops the affected feature without expanding processing instructions, authorizing deletion or removing applicable data-subject rights. Existing Easy Center protections are retained. No numeric retention period or provider no-training commitment is created by this proposal.',
      ],
    ],
    subprocessors: [
      [
        'Meet Classroom service scope',
        'Cloudflare may process realtime/media relay and application or durable room state for enabled Meet features. Existing configured storage, transcription and AI providers process only the data required for the enabled feature. The maintained registry and the actual enabled provider configuration determine the provider, purpose, data categories and transfer safeguards; a provider being listed does not mean every class is sent to it. This proposal adds no new provider or production data flow.',
      ],
      [
        'Provider retention and transfers',
        'Before enabling a recording, transcription, AI or telemetry flow, bind the actual processor and service, the relevant data categories, access, region/transfer safeguards and retention/deletion instructions. Do not apply a different Cloudflare product retention statement to the deployed Meet service. Provider receipt of a request does not prove delivery, erasure, residency or absence of training. See the existing registry and [Cloudflare Data Processing Addendum](https://www.cloudflare.com/cloudflare-customer-dpa/); contractual and configuration-specific limits remain applicable.',
      ],
    ],
  },
  vi: {
    privacy: [
      [
        'Dữ liệu lớp học và người tham gia',
        'Khi được bật, Meet Classroom xử lý mã tài khoản hoặc khách, tên hiển thị, siêu dữ liệu kết nối, âm thanh/hình ảnh, bản ghi, phụ đề, bản chép lời và tương tác trong lớp để cung cấp tính năng đã chọn. Tham gia ẩn danh không có nghĩa là kết nối không để lại siêu dữ liệu kỹ thuật. Chỉ gói trả phí được tham gia ẩn danh và vẫn tính vào giới hạn phòng. Ghi hình và phụ đề/chép lời cần thông báo và sự đồng ý phù hợp; đăng ký gói không thay thế sự đồng ý.\n\nHọc sinh trong lớp có thể là trẻ em. Khi học sinh chưa đến độ tuổi có thể tự đồng ý theo pháp luật áp dụng, nhà trường hoặc không gian (khách hàng/bên kiểm soát) phải có sự đồng ý có thể xác minh của cha mẹ hoặc người giám hộ, đồng thời lưu sự đồng ý của chính trẻ khi pháp luật cũng yêu cầu, trước khi ghi hình, phụ đề, chép lời, AI hoặc theo dõi chuyển tab. Đọc tuyên bố chung rằng dịch vụ không hướng tới trẻ dưới độ tuổi hợp pháp tối thiểu cùng quy định riêng này: nhà trường có thể dùng Meet Classroom cho học sinh chưa thành niên theo chỉ dẫn của khách hàng và yêu cầu về sự đồng ý của người giám hộ nêu trên.',
      ],
      [
        'AI, chuyển tab và lưu giữ',
        'AI mặc định tắt. Giáo viên có thể chọn hỗ trợ không đưa đáp án trực tiếp hoặc AI đầy đủ cho từng lớp. Cần thông báo cho học sinh về chế độ đã chọn và nội dung được xử lý trước khi sử dụng. Theo dõi chuyển tab mặc định tắt, chỉ bật khi giáo viên chọn. Khi bật, thông báo trước khi thu thập về sự kiện hiển thị/tiêu điểm, thời điểm, mục đích, người nhận và thời gian lưu. Sự kiện này không phải bằng chứng gian lận. Các biện pháp bảo vệ Easy Center vẫn áp dụng.\n\nBản ghi, phụ đề, bản chép lời, dữ liệu AI và dữ liệu theo dõi có yêu cầu truy cập và lưu giữ riêng. Tính năng được bật và chỉ dẫn của không gian xác định thời gian lưu và kiểm soát xóa áp dụng. Kết thúc cuộc họp không phải cam kết xóa ngay mọi bản lưu hoặc sao lưu. Dung lượng gói không phải thời gian lưu giữ. Cần giải thích ngoại lệ pháp lý và lịch xóa sao lưu; giới hạn gói không tạo cam kết lưu vô hạn hay tự động xóa.\n\nTheo dõi chuyển tab và AI đầy đủ cho trẻ em cần thông báo dành cho người giám hộ và sự đồng ý nêu trên. Xử lý dữ liệu trẻ em với mức bảo vệ bổ sung theo pháp luật áp dụng.',
      ],
    ],
    terms: [
      [
        'Kiểm soát lớp học và thông báo',
        'Chủ phòng và giáo viên phải thông báo cho học sinh trước khi bật ghi hình, phụ đề, chép lời, AI hoặc theo dõi chuyển tab, xin sự đồng ý cần thiết và tôn trọng quyền truy cập, quyền của học sinh. AI được chọn theo lớp: tắt, hỗ trợ không đưa đáp án trực tiếp hoặc đầy đủ. Không coi sự kiện chuyển tab là bằng chứng kết luận vi phạm. Tham gia ẩn danh chỉ dành cho gói trả phí và không bỏ qua xét duyệt, giới hạn phòng, sự đồng ý hay chống lạm dụng. Chủ phòng Free phải dùng tài khoản @tuturuuu.com đã xác minh.',
      ],
      [
        'Hạn mức Meet và dừng tính năng',
        'Hạn mức gói Meet được duyệt được nêu bên dưới. Mỗi phút AI đầy đủ tính hai phút hạn mức. Khi đạt hạn mức, tính năng đó dừng; điều này không cho phép tự tính phí vượt mức, đổi giá, tăng quyền hay xóa nội dung khách hàng đã lưu. Giáo viên có thể đặt giới hạn phòng thấp hơn; vẫn áp dụng giới hạn gói và trần nền tảng 100 người. Giá và thay đổi thương mại theo trang thanh toán hoặc hợp đồng áp dụng. Bảng là chính sách gói, không khẳng định mọi tính năng đã được bật.',
      ],
    ],
    dpa: [
      [
        'Chỉ dẫn xử lý lớp học',
        'Với lớp do khách hàng kiểm soát, chỉ dẫn xử lý bao gồm siêu dữ liệu kết nối và danh tính, truyền thông trực tiếp, bản ghi, phụ đề, bản chép lời, dữ liệu AI tùy chọn và sự kiện chuyển tab tùy chọn. Khách hàng xác định mục đích hợp pháp, thông báo cho học sinh, quyền cần thiết và người được truy cập. Tuturuuu xử lý nội dung để cung cấp tính năng được bật theo chỉ dẫn đó. Người tham gia ẩn danh vẫn là chủ thể dữ liệu; không được mô tả mã kỹ thuật là không thể truy vết hoặc mặc nhiên không phải dữ liệu cá nhân.\n\nVới học sinh chưa thành niên, khách hàng chịu trách nhiệm về cơ sở pháp lý và sự đồng ý của người giám hộ, gồm sự đồng ý của chính trẻ khi pháp luật áp dụng yêu cầu. Tuturuuu chỉ xử lý dữ liệu đó theo các chỉ dẫn hợp pháp này.',
      ],
      [
        'Kiểm soát, lưu giữ và hạn mức',
        'AI mặc định tắt và chọn theo lớp; chuyển tab cần giáo viên bật và thông báo trước cho học sinh. Áp dụng chỉ dẫn truy cập, xóa và lưu giữ riêng cho phiên trực tiếp, dữ liệu đã lưu, bản chép lời, dữ liệu AI và theo dõi, gồm bản tại nhà cung cấp và sao lưu. Xác định ngoại lệ lưu giữ/xóa và mục đích được phép. Chạm hạn mức chỉ dừng tính năng liên quan, không mở rộng chỉ dẫn xử lý, cho phép xóa hay làm mất quyền theo luật. Giữ nguyên bảo vệ Easy Center. Đề xuất này không tự đặt số ngày lưu hay cam kết nhà cung cấp không huấn luyện.',
      ],
    ],
    subprocessors: [
      [
        'Phạm vi nhà cung cấp cho Meet Classroom',
        'Cloudflare có thể xử lý chuyển tiếp truyền thông và trạng thái ứng dụng/phòng cho tính năng Meet được bật. Nhà cung cấp lưu trữ, chép lời và AI đã cấu hình chỉ xử lý dữ liệu cần cho tính năng được bật. Danh mục hiện có và cấu hình thực tế xác định nhà cung cấp, mục đích, loại dữ liệu và bảo đảm chuyển dữ liệu; có tên trong danh mục không có nghĩa mọi lớp đều gửi dữ liệu đến họ. Đề xuất không thêm nhà cung cấp hay luồng dữ liệu vận hành mới.',
      ],
      [
        'Lưu giữ và chuyển dữ liệu tại nhà cung cấp',
        'Trước khi bật luồng ghi hình, chép lời, AI hoặc theo dõi, xác định nhà cung cấp và dịch vụ thực tế, loại dữ liệu, truy cập, khu vực/bảo đảm chuyển dữ liệu và chỉ dẫn lưu giữ/xóa. Không áp dụng thời gian lưu của sản phẩm Cloudflare khác cho dịch vụ Meet đang chạy. Nhà cung cấp nhận yêu cầu không chứng minh giao thành công, xóa, nơi lưu hay không huấn luyện. Xem danh mục hiện có và [Phụ lục xử lý dữ liệu Cloudflare](https://www.cloudflare.com/cloudflare-customer-dpa/); vẫn áp dụng giới hạn hợp đồng và cấu hình.',
      ],
    ],
  },
} as const;

const planTable = `| Plan | People | Meeting | Monthly meetings/time | AI/month | Storage | Anonymous |
| --- | --- | --- | --- | --- | --- | --- |
| FREE | 10 | 40 min | 10 meetings | 0 | 1 GB | No |
| PLUS | 50 | 4 h | 40 h | 10 h | 20 GB | Yes |
| PRO | 50 | 8 h | 160 h | 40 h | 100 GB | Yes |
| ENTERPRISE | 100 | 12 h | 600 h | 160 h | 1 TB | Yes |`;

/** A separate, unpublished proposal. Never selects or publishes an existing revision. */
export function getClassroomLegalProposal(
  kind: ClassroomLegalKind,
  locale: LegalLocale
) {
  const current = getLegalDocument(kind, locale);
  return {
    ...current,
    version: '2026-11-10-meet-classroom',
    published: false as const,
    publishedDate: null,
    effectiveDate: null,
    reviewRequired: true,
    badge: locale === 'vi' ? 'Dự kiến' : 'Proposed',
    sections: [
      ...current.sections,
      ...copy[locale][kind].map(([title, content], index) => ({
        id: `${kind}-meet-classroom-${index + 1}`,
        title,
        content:
          kind === 'terms' && index === 1
            ? `${content}\n\n${planTable}`
            : content,
        icon: 'users' as const,
        tone: 'blue' as const,
      })),
    ],
  } satisfies Omit<LegalDocument, 'effectiveDate' | 'publishedDate'> & {
    published: false;
    effectiveDate: null;
    publishedDate: null;
  };
}
