import type { Locale } from '../../lib/platform/locale';
import type { ChangelogCopy } from './types';

const changelogCopyByLocale: Record<Locale, ChangelogCopy> = {
  en: {
    badge: 'Platform Updates',
    backToChangelog: 'Back to Changelog',
    ctaButton: 'Follow on GitHub',
    ctaDescription:
      'Follow our GitHub repository to stay informed about the latest developments and contribute to the project.',
    ctaTitle: 'Never miss an update',
    feedbackButton: 'Start a Discussion',
    feedbackDescription:
      "We'd love to hear from you! Open an issue or start a discussion on GitHub.",
    feedbackTitle: 'Have feedback or suggestions?',
    heroDescription:
      'Stay up to date with the latest features, improvements, and updates to make your workflow even better.',
    heroTitle: "What's New in",
    next: 'Next',
    noUpdates: 'No updates yet',
    noUpdatesDescription:
      "We're working on exciting new features. Check back soon!",
    previous: 'Previous',
    readMore: 'Read more',
    update: 'update',
    updates: 'updates',
  },
  vi: {
    badge: 'Cập Nhật Nền Tảng',
    backToChangelog: 'Quay lại nhật ký thay đổi',
    ctaButton: 'Theo dõi trên GitHub',
    ctaDescription:
      'Theo dõi kho GitHub của chúng tôi để cập nhật những phát triển mới nhất và đóng góp cho dự án.',
    ctaTitle: 'Không bỏ lỡ cập nhật nào',
    feedbackButton: 'Bắt đầu thảo luận',
    feedbackDescription:
      'Chúng tôi luôn muốn lắng nghe góp ý của bạn! Hãy mở issue hoặc bắt đầu thảo luận trên GitHub.',
    feedbackTitle: 'Bạn có góp ý hoặc đề xuất?',
    heroDescription:
      'Cập nhật những tính năng, cải tiến và thay đổi mới nhất để nâng cao hiệu suất làm việc của bạn.',
    heroTitle: 'Có Gì Mới Tại',
    next: 'Tiếp theo',
    noUpdates: 'Chưa có cập nhật nào',
    noUpdatesDescription:
      'Chúng tôi đang phát triển các tính năng mới thú vị. Hãy quay lại sau!',
    previous: 'Trước đó',
    readMore: 'Xem thêm',
    update: 'cập nhật',
    updates: 'cập nhật',
  },
};

export function getChangelogCopy(locale: Locale) {
  return changelogCopyByLocale[locale];
}
