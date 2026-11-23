/**
 * EduFest 2026 run of show: the latest rehearsal check of each step.
 *
 * Update a step after each signed-in check on production: set `checkedAt`
 * to the check's day (Vietnam time), the readiness it showed, the owning
 * team, the next latest-by date and one line on what is left, in English
 * and Vietnamese. A check older than STALE_AFTER_DAYS shows as stale.
 * Bugs are not listed here: file them as public issues labelled
 * `edufest-2026` and `edufest:<step>` and the page lists them.
 */
import type { RunStepId, Verdict } from './edufest-2026-run.ts';

export const VERDICTS: Readonly<Partial<Record<RunStepId, Verdict>>> = {
  s0: {
    readiness: 'at_risk',
    checkedAt: '2026-11-23',
    owner: 'workshop',
    nextEta: '2026-11-24',
    left: {
      en: 'Run sign-in end to end, then 50 sign-ins at once on venue Wi-Fi.',
      vi: 'Chạy thử đăng nhập trọn vẹn, rồi 50 lượt đăng nhập cùng lúc trên Wi-Fi hội trường.',
    },
  },
  s1: {
    readiness: 'missing',
    checkedAt: '2026-11-23',
    owner: 'workshop',
    nextEta: '2026-11-25',
    left: {
      en: 'Write the slides and the presenter script for the opening.',
      vi: 'Soạn slide và kịch bản dẫn cho phần mở đầu.',
    },
  },
  s2: {
    readiness: 'at_risk',
    checkedAt: '2026-11-23',
    owner: 'upskii',
    nextEta: '2026-11-25',
    left: {
      en: 'First live run of the AI tutor, the AI quiz and the English coach.',
      vi: 'Chạy thật lần đầu gia sư AI, bài kiểm tra AI và trợ lý luyện tiếng Anh.',
    },
  },
  s3: {
    readiness: 'at_risk',
    checkedAt: '2026-11-23',
    owner: 'upskii',
    nextEta: '2026-11-26',
    left: {
      en: 'Build AI lessons and an AI quiz live, show the results, and release the refreshed Upskii design.',
      vi: 'Tạo bài học và bài kiểm tra AI trên bản thật, xem kết quả, rồi phát hành giao diện Upskii mới.',
    },
  },
  s4: {
    readiness: 'missing',
    checkedAt: '2026-11-23',
    owner: 'platform',
    nextEta: '2026-11-28',
    left: {
      en: 'Account linking and the Upskii integration card; check guest join with a real class link.',
      vi: 'Liên kết tài khoản và thẻ tích hợp Upskii; kiểm tra vào lớp với tư cách khách bằng đường dẫn thật.',
    },
  },
  s5: {
    readiness: 'missing',
    checkedAt: '2026-11-23',
    owner: 'meet',
    nextEta: '2026-11-30',
    left: {
      en: 'Present Upskii lessons in Meet; release Follow me and the reworked class activities.',
      vi: 'Trình chiếu bài học Upskii trong Meet; phát hành Theo dõi tôi và các hoạt động lớp học mới.',
    },
  },
  s6: {
    readiness: 'at_risk',
    checkedAt: '2026-11-23',
    owner: 'meet',
    nextEta: '2026-11-24',
    left: {
      en: 'The Q&A panel is built and waits for release.',
      vi: 'Bảng Hỏi đáp đã xong và đang chờ phát hành.',
    },
  },
  s7: {
    readiness: 'at_risk',
    checkedAt: '2026-11-23',
    owner: 'meet',
    nextEta: '2026-11-29',
    left: {
      en: 'Turn AI notes back on, save several action items at once and keep the meeting linked to its board.',
      vi: 'Bật lại ghi chú AI, lưu nhiều việc cần làm cùng lúc và giữ liên kết giữa cuộc họp với bảng công việc.',
    },
  },
};
