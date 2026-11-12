import type { LegalDocument, LegalLocale, LegalSection } from './types';

export const MEET_AI_LEGAL_SOURCE_SHA =
  'f83e4ddf0d68a33f7b7b13c8ab3421de877a374d';
export const MEET_AI_LEGAL_CONTRACTS = {
  v1: '1fe1924bc17c843cfd524df87dc81c0b3d68b7f58a531a553a57b6ff29a2a1cc',
  v1_1: '6963adc4995ecb9f9648943caccf58a107e993eb93e6125a6a1fde3e9363021c',
} as const;

/** Release requirements, not a statement that these controls are implemented. */
export const MEET_AI_REQUIRED_GATES = {
  status: 'required-not-verified-live',
  billingAuthority: 'server-billing-truth',
  billingCheckAtStart: true,
  billingRecheckMaxSeconds: 300,
  billingStates: 'existing-billing-entitlement-semantics-only',
  unknownBilling: 'deny',
  allowlist: 'removed-or-additional-narrowing-only',
  notice: 'versioned-before-processing-with-persistent-indicator',
  acknowledgement: 'own-session-current-version-per-participant',
  optOut: 'server-enforced-through-reconnect-next-chunk',
  mixedStream: 'deny-whole-mix-unless-all-contributors-eligible',
  erase: 'meeting-transcript-summary-and-acknowledgements',
  logs: 'hashed-room-and-participant-version-decision-reason-only',
  guests: 'separate-change',
} as const;

/** References resolve only at MEET_AI_LEGAL_SOURCE_SHA; unknowns need runtime evidence. */
export const MEET_AI_REVISION_EVIDENCE: Readonly<Record<string, readonly string[]>> = {
  'meet-ai-inputs': [
    'packages/ai/src/meetings/gemini.ts:61',
    'packages/ai/src/meetings/gemini.ts:86',
    'packages/ai/src/meetings/gemini.ts:123',
    'packages/ai/src/meetings/transcription-hints.ts:15',
    'packages/ai/src/meetings/transcript.ts:102',
    'packages/ai/src/meetings/chat.ts:37',
    'packages/meet-core/src/features/meeting-ai/audio-sources.ts:15',
    'packages/meet-core/src/features/meeting-ai/audio.ts:89',
    'packages/meet-core/src/features/meeting-ai/use-meeting-ai.ts:332',
    'packages/meet-core/src/cloudflare/live/audio-input.ts:13',
    'packages/meet-core/src/cloudflare/live/provider.ts:75',
    'packages/meet-core/src/cloudflare/live/provider.ts:96',
  ],
  'meet-ai-storage': [
    'packages/meet-core/src/features/meeting-ai/server/chunks.ts:182',
    'apps/database/supabase/migrations/20260907040000_meet_ai_sessions.sql:2',
    'packages/meet-core/src/cloudflare/live/storage.ts:93',
    'packages/realtime/src/meet/room-live-transcript.ts:14',
    'packages/realtime/src/meet/chat-retention.ts:8',
    'packages/meet-core/src/routes/api/meet-call/[meetingId]/recording/route.ts:41',
    'packages/meet-core/src/features/call/hooks/use-room-recording.ts:47',
    'apps/web/src/app/api/v1/workspaces/[wsId]/meetings/[meetingId]/recordings/[sessionId]/upload/route.ts:129',
    'packages/storage-core/src/lib/workspace-storage-config.ts:1',
    'packages/storage-core/src/lib/workspace-storage-provider.ts:388',
    'apps/meet/void.config.ts:39',
  ],
  'meet-ai-retention': [
    'apps/database/supabase/migrations/20261029170000_meet_transcript_retention_purge.sql:1',
    'apps/database/supabase/migrations/20261029170000_meet_transcript_retention_purge.sql:38',
    'apps/database/supabase/migrations/20261030044719_meet_ai_consent_schema.sql:17',
    'apps/database/supabase/migrations/20261030044719_meet_ai_consent_schema.sql:144',
    'packages/meet-core/src/cloudflare/live/erase-context.ts:11',
    'packages/realtime/src/meet/room-ending.ts:23',
    'packages/legal/src/documents.ts:12',
    'apps/database/supabase/migrations/20261030044719_meet_ai_consent_schema.sql:24',
  ],
  'meet-ai-controls': [
    'apps/meet/void.config.ts:79',
    'packages/realtime/src/meet/transcription.ts:45',
    'packages/realtime/src/meet/transcription.ts:114',
    'packages/meet-core/src/features/live-assistant/input-sources.ts:12',
    'packages/meet-core/src/features/meeting-ai/audio-sources.ts:34',
    'apps/database/supabase/migrations/20261030044719_meet_ai_consent_schema.sql:22',
  ],
  'meet-ai-output-review': [
    'packages/ai/src/meetings/gemini.ts:126',
    'packages/ai/src/meetings/transcript.ts:102',
  ],
  'meet-ai-processors': [
    'packages/ai/src/meetings/gemini.ts:61',
    'packages/meet-core/src/features/call/server/chat-model.ts:12',
    'packages/meet-core/src/cloudflare/live/provider.ts:35',
    'apps/meet-realtime/src/room-do.ts:221',
    'packages/storage-core/src/lib/workspace-storage-config.ts:1',
  ],
  'meet-ai-regions': [
    'apps/meet/void.config.ts:17',
    'packages/ai/src/meetings/gemini.ts:61',
    'packages/meet-core/src/cloudflare/live/provider.ts:35',
    'packages/storage-core/src/lib/workspace-storage-config.ts:59',
  ],
};

type MeetLegalKind = 'privacy' | 'terms' | 'subprocessors';
type Addition = readonly [id: string, title: string, content: string];

const copy: Record<LegalLocale, Record<MeetLegalKind, readonly Addition[]>> = {
  en: {
    privacy: [
      ['meet-ai-inputs', 'Meet AI inputs',
        'When enabled, Meet transcription sends WAV audio from microphones and shared audio to Google Gemini. The capture path includes remote microphones; it captures tracks separately and can send indexed audio files in a batch. Transcription requests can include language, glossary and context hints. Meeting notes send transcript text with source identifiers and timing, meeting start time and timezone. @mira chat can send the latest 40 messages, up to 1,250 characters each, with display names, the question and timezone. Mira Live sends PCM audio and context that can include enabled personal memories, shared context and recent turns; Google Search is configured for Meet Live. These are processing paths in the source, not proof that AI is enabled in a deployed room.'],
      ['meet-ai-storage', 'Meet transcripts and recordings',
        'Transcript text, speaker segments, notes and usage are written through Supabase database services. Live conversation turns use Cloudflare Durable Object storage; room chat can include Mira replies. Chat has count limits, which are not a time-based deletion schedule. Recording is separate from AI transcription: browser recordings can contain audio and video and are uploaded to the meeting creator’s personal workspace Drive through its configured Supabase or Cloudflare R2 storage provider. A separate workspace recording upload route also stores raw WebM in the private Supabase workspaces bucket. The Meet R2 cache binding is an application cache, not evidence of a recording bucket. The active Drive provider, bucket and storage region are UNKNOWN without configuration evidence.'],
      ['meet-ai-retention', 'Meet retention and deletion limits',
        'The source defines a 365-day eligibility cutoff for a transcript purge covering transcript chunks, AI notes and recording transcripts. Its deletion fence starts closed and requires separate enablement; whether deletion is active in production is UNKNOWN. The purge excludes recordings, consent records, memories and Durable Object state. Live session-end cleanup clears conversation context and turn archives in bounded steps; it keeps billing receipts and separately saved memories. Ending a room clears presence and temporary transcription consent state, not all stored content. Nullable retention configuration can represent no expiry; a configured date alone does not prove deletion. Consent foreign keys restrict deletion of referenced sessions. A complete meeting erase runtime is not established by this source. Recording, room-chat, memory, consent and billing retention periods, backup deletion timing, and Google retention and training use are UNKNOWN here. Send deletion requests to privacy@tuturuuu.com for handling by Tuturuuu; do not rely on automatic meeting or workspace erasure. No fixed deletion deadline or provider retention commitment is established by this revision.'],
    ],
    terms: [
      ['meet-ai-controls', 'Meet AI controls and availability',
        'The checked source configuration disables Meet AI. Talk to Mira and Mute to Mira affect the initiating browser’s assistant audio selection. They do not establish server enforcement for every AI path. Transcription source selection includes remote microphones without a per-person consent filter. Temporary room consent state and a database consent schema do not establish a rendered, versioned acknowledgement in the running service; the live notice version is UNKNOWN. Publication of this disclosure does not enable AI or change guest access. Server-verified notice, acknowledgement and opt-out enforcement require separate implementation and live acceptance before activation.'],
      ['meet-ai-output-review', 'Review meeting AI output',
        'Meet AI generates transcripts, summaries, decisions, suggested tasks and calendar suggestions. Its prompts require supported statements and preserve uncertainty about speakers, owners and dates. These instructions do not guarantee accuracy. Review outputs before relying on them or saving follow-up actions. The microphone owner is not necessarily the person speaking, and shared audio may contain other people. Provider retention, training use and processing region are UNKNOWN from this source.'],
    ],
    subprocessors: [
      ['meet-ai-processors', 'Meet processing services',
        'Google Gemini processes transcription audio, transcript-based notes, Mira chat and Live inputs and context. Cloudflare runs Meet application and realtime services, carries call media through SFU/TURN and stores Durable Object state. Supabase provides database services; the separate Drive recording path supports Supabase storage or Cloudflare R2 according to workspace configuration. These disclosures identify existing code paths and do not add a processor. Google retention and training use, Cloudflare SFU/TURN media retention and the live recording storage provider are UNKNOWN.'],
      ['meet-ai-regions', 'Meet regions',
        'Meet Worker configuration contains the placement hint aws:ap-southeast-1. This is a Worker placement hint, not a commitment that AI processing, database storage, recordings or all media stay in that region. Google processing is governed by the applicable Google terms. The Gemini client configuration specifies no processing region. Gemini processing region, database and Drive storage region, and provider residency guarantees are UNKNOWN from this source.'],
    ],
  },
  vi: {
    privacy: [
      ['meet-ai-inputs', 'Dữ liệu đầu vào AI của Meet',
        'Khi được bật, tính năng chép lời Meet gửi âm thanh WAV từ micro và âm thanh chia sẻ đến Google Gemini. Luồng thu nhận bao gồm micro của người tham gia từ xa; từng track được thu riêng và có thể gửi thành các tệp đánh số trong một lô. Yêu cầu chép lời có thể kèm gợi ý ngôn ngữ, thuật ngữ và ngữ cảnh. Ghi chú cuộc họp gửi bản chép lời với mã nguồn âm thanh và mốc thời gian, thời điểm bắt đầu và múi giờ. Chat @mira có thể gửi 40 tin nhắn gần nhất, mỗi tin tối đa 1.250 ký tự, cùng tên hiển thị, câu hỏi và múi giờ. Mira Live gửi âm thanh PCM và ngữ cảnh có thể gồm bộ nhớ cá nhân đã bật, ngữ cảnh chia sẻ và lượt hội thoại gần đây; Meet Live có cấu hình Google Search. Đây là các luồng xử lý trong mã nguồn, không phải bằng chứng AI đang bật trong phòng đã triển khai.'],
      ['meet-ai-storage', 'Bản chép lời và bản ghi Meet',
        'Nội dung chép lời, đoạn gắn người nói, ghi chú và dữ liệu sử dụng được ghi qua dịch vụ cơ sở dữ liệu Supabase. Lượt hội thoại Live dùng bộ nhớ Cloudflare Durable Object; chat phòng có thể chứa câu trả lời của Mira. Giới hạn số tin nhắn không phải lịch xóa theo thời gian. Ghi âm/ghi hình tách biệt với chép lời AI: bản ghi trong trình duyệt có thể chứa âm thanh và video, rồi được tải lên Drive của không gian cá nhân người tạo cuộc họp qua Supabase hoặc Cloudflare R2 theo cấu hình. Một tuyến tải bản ghi không gian làm việc riêng cũng lưu WebM thô trong bucket workspaces riêng tư của Supabase. Ràng buộc R2 cache của Meet là bộ nhớ đệm ứng dụng, không chứng minh nơi lưu bản ghi. Nhà cung cấp Drive đang dùng, bucket và vùng lưu trữ là UNKNOWN nếu chưa có bằng chứng cấu hình.'],
      ['meet-ai-retention', 'Giới hạn lưu giữ và xóa dữ liệu Meet',
        'Mã nguồn quy định ngưỡng đủ điều kiện 365 ngày cho tác vụ dọn đoạn chép lời, ghi chú AI và bản chép lời từ bản ghi. Chốt cho phép xóa mặc định đóng và cần bật riêng; trạng thái xóa trong môi trường sản xuất là UNKNOWN. Tác vụ này không xóa bản ghi, hồ sơ đồng ý, bộ nhớ hay trạng thái Durable Object. Dọn dẹp cuối phiên Live xóa ngữ cảnh hội thoại và kho lượt hội thoại theo từng bước giới hạn; vẫn giữ chứng từ tính phí và bộ nhớ được lưu riêng. Kết thúc phòng xóa hiện diện và trạng thái đồng ý chép lời tạm thời, không xóa mọi nội dung đã lưu. Cấu hình lưu giữ có thể để trống để biểu thị không hết hạn; riêng một ngày cấu hình không chứng minh dữ liệu được xóa. Khóa ngoại hồ sơ đồng ý hạn chế xóa phiên được tham chiếu. Mã nguồn này chưa chứng minh có tiến trình xóa toàn bộ cuộc họp. Thời hạn lưu bản ghi, chat phòng, bộ nhớ, hồ sơ đồng ý và dữ liệu tính phí, thời điểm xóa bản sao lưu, thời hạn lưu và việc dùng dữ liệu để huấn luyện của Google đều là UNKNOWN tại đây. Gửi yêu cầu xóa đến privacy@tuturuuu.com để Tuturuuu xử lý; không dựa vào việc tự động xóa cuộc họp hoặc không gian làm việc. Bản sửa đổi này không xác lập hạn xóa cố định hay cam kết lưu giữ của nhà cung cấp.'],
    ],
    terms: [
      ['meet-ai-controls', 'Điều khiển và trạng thái AI của Meet',
        'Cấu hình trong mã nguồn được kiểm tra đang tắt AI của Meet. Talk to Mira và Mute to Mira tác động đến việc chọn âm thanh trợ lý trong trình duyệt khởi tạo. Các nút này chưa chứng minh có kiểm soát phía máy chủ trên mọi luồng AI. Việc chọn nguồn chép lời bao gồm micro từ xa mà không lọc theo đồng ý của từng người. Trạng thái đồng ý tạm thời của phòng và lược đồ đồng ý trong cơ sở dữ liệu chưa chứng minh dịch vụ đang chạy có xác nhận thông báo đã hiển thị theo phiên bản; phiên bản thông báo đang dùng là UNKNOWN. Công bố nội dung này không bật AI hoặc thay đổi quyền khách. Kiểm soát thông báo, xác nhận và từ chối phía máy chủ cần được triển khai và nghiệm thu trực tiếp riêng trước khi kích hoạt.'],
      ['meet-ai-output-review', 'Kiểm tra kết quả AI cuộc họp',
        'AI của Meet tạo bản chép lời, tóm tắt, quyết định, đề xuất công việc và lịch. Chỉ dẫn yêu cầu nội dung có căn cứ và giữ sự không chắc chắn về người nói, người phụ trách và ngày tháng. Chỉ dẫn không bảo đảm độ chính xác. Hãy kiểm tra kết quả trước khi dựa vào đó hoặc lưu hành động tiếp theo. Chủ micro không nhất thiết là người đang nói; âm thanh chia sẻ có thể chứa người khác. Thời hạn lưu giữ, việc dùng dữ liệu để huấn luyện và vùng xử lý của nhà cung cấp là UNKNOWN theo mã nguồn này.'],
    ],
    subprocessors: [
      ['meet-ai-processors', 'Dịch vụ xử lý cho Meet',
        'Google Gemini xử lý âm thanh chép lời, ghi chú từ bản chép lời, đầu vào và ngữ cảnh chat Mira và Live. Cloudflare vận hành ứng dụng và dịch vụ thời gian thực Meet, truyền media cuộc gọi qua SFU/TURN và lưu trạng thái Durable Object. Supabase cung cấp dịch vụ cơ sở dữ liệu; luồng bản ghi Drive riêng hỗ trợ Supabase hoặc Cloudflare R2 theo cấu hình không gian làm việc. Nội dung này mô tả luồng mã hiện có, không bổ sung nhà xử lý. Thời hạn lưu và việc dùng dữ liệu để huấn luyện của Google, việc giữ media SFU/TURN của Cloudflare và nhà cung cấp lưu bản ghi đang dùng đều là UNKNOWN.'],
      ['meet-ai-regions', 'Vùng xử lý của Meet',
        'Cấu hình Worker của Meet có gợi ý vị trí aws:ap-southeast-1. Đây là gợi ý vị trí Worker, không cam kết xử lý AI, cơ sở dữ liệu, bản ghi hay mọi media đều ở vùng đó. Việc Google xử lý dữ liệu chịu sự điều chỉnh của các điều khoản Google áp dụng. Cấu hình ứng dụng khách Gemini không chỉ định vùng xử lý. Vùng xử lý Gemini, vùng lưu cơ sở dữ liệu và Drive, cùng bảo đảm về nơi lưu dữ liệu của nhà cung cấp là UNKNOWN theo mã nguồn này.'],
    ],
  },
};

/** Builds a review draft without changing the effective agreement or source object. */
export function reviseMeetAiLegalDocument(document: LegalDocument): LegalDocument {
  if (!['privacy', 'terms', 'subprocessors'].includes(document.kind)) return document;
  const additions = copy[document.locale][document.kind as MeetLegalKind];
  const ids = new Set(document.sections.map((section) => section.id));
  const missing = additions.filter(([id]) => !ids.has(id));
  if (!missing.length) return document;
  return {
    ...document,
    badge: document.locale === 'en' ? 'Draft for review' : 'Bản dự thảo cần rà soát',
    version: '2026-11-12-meet-ai-draft',
    publishedDate: '2026-11-12',
    reviewRequired: true,
    sections: [
      ...document.sections,
      ...missing.map(([id, title, content]): LegalSection => ({
        id,
        title,
        content,
        icon: 'shield',
        tone: 'blue',
      })),
    ],
  };
}
