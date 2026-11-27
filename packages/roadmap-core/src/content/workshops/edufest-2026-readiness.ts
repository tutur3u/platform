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
    readiness: 'ready',
    checkedAt: '2026-11-27',
    owner: 'upskii',
    nextEta: '2026-12-01',
    left: {
      en: 'The Upskii release is live. Left: the full sign-in check with 50 people on venue Wi-Fi, in the 1 Dec full E2E.',
      vi: 'Bản phát hành Upskii đã lên. Còn lại: kiểm tra đăng nhập trọn vẹn với 50 người trên Wi-Fi hội trường, trong buổi E2E đầy đủ ngày 1/12.',
    },
  },
  s1: {
    readiness: 'at_risk',
    checkedAt: '2026-11-27',
    owner: 'workshop',
    nextEta: '2026-12-03',
    left: {
      en: 'The script and slide outline are written; finish the slides for the 3–4 Dec rehearsal.',
      vi: 'Đã có kịch bản và dàn ý slide; hoàn thiện slide cho buổi tổng duyệt 3–4/12.',
    },
  },
  s2: {
    readiness: 'ready',
    checkedAt: '2026-11-27',
    owner: 'upskii',
    nextEta: '2026-12-01',
    left: {
      en: 'The Upskii release is live. Left: the full live check of the class link, guided L2 tutor and three-question quiz, in the 1 Dec full E2E.',
      vi: 'Bản phát hành Upskii đã lên. Còn lại: kiểm tra thật đường dẫn lớp, gia sư ở chế độ gợi ý trong Bài 2 và bài kiểm tra 3 câu, trong buổi E2E đầy đủ ngày 1/12.',
    },
  },
  s3: {
    readiness: 'ready',
    checkedAt: '2026-11-27',
    owner: 'upskii',
    nextEta: '2026-12-01',
    left: {
      en: 'The Upskii release is live. Left: the full live check of the prepared lesson and the class quiz results, in the 1 Dec full E2E.',
      vi: 'Bản phát hành Upskii đã lên. Còn lại: kiểm tra thật bài học đã soạn sẵn và kết quả bài kiểm tra của lớp, trong buổi E2E đầy đủ ngày 1/12.',
    },
  },
  s4: {
    readiness: 'at_risk',
    checkedAt: '2026-11-27',
    owner: 'upskii',
    nextEta: '2026-11-30',
    left: {
      en: 'The S4 handover is on Upskii main. Left: the Upskii lead confirms S4 and W4 are live, so the production E2E can run.',
      vi: 'Bước S4 đã có trên nhánh chính của Upskii. Còn lại: trưởng nhóm Upskii xác nhận S4 và W4 đã lên, để chạy E2E trên production.',
    },
  },
  s5: {
    readiness: 'at_risk',
    checkedAt: '2026-11-27',
    owner: 'meet',
    nextEta: '2026-12-02',
    left: {
      en: 'The join-budget fix is on main. Left: the combined Meet UX fixes release before the 2 Dec 18:00 freeze, then the production E2E once S4 and W4 are confirmed.',
      vi: 'Bản sửa ngân sách vào phòng đã có trên nhánh chính. Còn lại: bản phát hành gộp các sửa lỗi giao diện Meet trước giờ đóng băng 18:00 ngày 2/12, rồi chạy E2E trên production sau khi S4 và W4 được xác nhận.',
    },
  },
  s6: {
    readiness: 'at_risk',
    checkedAt: '2026-11-27',
    owner: 'meet',
    nextEta: '2026-12-02',
    left: {
      en: 'The Meet issue for this step is closed. Left: the combined Meet UX fixes release, then the rehearsal room after the last release before the 2 Dec 18:00 freeze; dry run 3 Dec.',
      vi: 'Lỗi Meet liên quan bước này đã đóng. Còn lại: bản phát hành gộp các sửa lỗi giao diện Meet, rồi tạo phòng tổng duyệt sau bản phát hành cuối trước giờ đóng băng 18:00 ngày 2/12; chạy thử ngày 3/12.',
    },
  },
  s7: {
    readiness: 'at_risk',
    checkedAt: '2026-11-27',
    owner: 'meet',
    nextEta: '2026-12-02',
    left: {
      en: 'The meeting-delete fix is closed. Left: the combined Meet UX fixes before the 2 Dec freeze, then the 3–4 Dec rehearsal. The presenter-only notes room stays the primary plan.',
      vi: 'Lỗi xoá cuộc họp có Mira đã đóng. Còn lại: bản sửa giao diện Meet gộp trước giờ đóng băng ngày 2/12, rồi buổi tổng duyệt 3–4/12. Phòng ghi chú chỉ dành cho người trình bày vẫn là phương án chính.',
    },
  },
};
