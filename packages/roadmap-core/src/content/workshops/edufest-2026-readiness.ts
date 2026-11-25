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
    checkedAt: '2026-11-25',
    owner: 'upskii',
    nextEta: null,
    left: {
      en: 'Sign-in ships with the next Upskii release; then a full sign-in check with 50 people on venue Wi-Fi.',
      vi: 'Đăng nhập ra mắt cùng bản phát hành Upskii tiếp theo; sau đó kiểm tra đăng nhập trọn vẹn với 50 người trên Wi-Fi hội trường.',
    },
  },
  s1: {
    readiness: 'at_risk',
    checkedAt: '2026-11-25',
    owner: 'workshop',
    nextEta: '2026-12-03',
    left: {
      en: 'The script and slide outline are written; finish the slides for the 3–4 Dec rehearsal.',
      vi: 'Đã có kịch bản và dàn ý slide; hoàn thiện slide cho buổi tổng duyệt 3–4/12.',
    },
  },
  s2: {
    readiness: 'at_risk',
    checkedAt: '2026-11-25',
    owner: 'upskii',
    nextEta: null,
    left: {
      en: 'Waits on the next Upskii release, then a live check of the class link, AI tutor, AI quiz and English coach.',
      vi: 'Chờ bản phát hành Upskii tiếp theo, rồi kiểm tra thật đường dẫn lớp, gia sư AI, bài kiểm tra AI và trợ lý tiếng Anh.',
    },
  },
  s3: {
    readiness: 'at_risk',
    checkedAt: '2026-11-25',
    owner: 'upskii',
    nextEta: null,
    left: {
      en: 'Waits on the next Upskii release, then a live check of AI lesson and quiz generation.',
      vi: 'Chờ bản phát hành Upskii tiếp theo, rồi kiểm tra thật việc tạo bài học và bài kiểm tra bằng AI.',
    },
  },
  s4: {
    readiness: 'at_risk',
    checkedAt: '2026-11-25',
    owner: 'upskii',
    nextEta: null,
    left: {
      en: 'Joining Meet, guest join and the Mira tick box work; account linking waits on the Upskii-side release.',
      vi: 'Vào Meet, vào lớp với tư cách khách và ô đồng ý Mira đã hoạt động; liên kết tài khoản chờ bản phát hành phía Upskii.',
    },
  },
  s5: {
    readiness: 'at_risk',
    checkedAt: '2026-11-25',
    owner: 'meet',
    nextEta: '2026-12-01',
    left: {
      en: 'Launching an Upskii assessment from Meet works; course import and the new in-room layout ship with the next Meet releases.',
      vi: 'Mở bài kiểm tra Upskii từ Meet đã hoạt động; nhập từ khóa học và bố cục phòng học mới ra mắt cùng các bản phát hành Meet tới.',
    },
  },
  s6: {
    readiness: 'at_risk',
    checkedAt: '2026-11-25',
    owner: 'meet',
    nextEta: '2026-12-01',
    left: {
      en: 'Switch on the new in-room layout and join flow by 1 Dec, then the 2 Dec script walk-through on the new Meet UI.',
      vi: 'Bật bố cục phòng học và luồng vào phòng mới trước 1/12, rồi chạy thử kịch bản trên giao diện Meet mới ngày 2/12.',
    },
  },
  s7: {
    readiness: 'at_risk',
    checkedAt: '2026-11-25',
    owner: 'meet',
    nextEta: '2026-11-28',
    left: {
      en: 'The plan of the workshop workspace needs the transcription model; the notes fix ships with the next Meet release.',
      vi: 'Gói của workspace hội thảo cần có mô hình chép lời; bản sửa ghi chú ra mắt cùng bản phát hành Meet tới.',
    },
  },
};
