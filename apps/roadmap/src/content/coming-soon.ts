/** Approved public copy. Change only with an approved replacement. */
import { showPlans } from './tracks.ts';

export const comingSoon = [
  {
    id: 'mira-subscription-plans',
    track: 'mira',
    title: { en: 'Mira subscription plans', vi: 'Các gói đăng ký Mira' },
    body: {
      en: 'Mira subscription plans at $100 and $200/month for access to Mira at the highest limits and capabilities.',
      vi: 'Các gói đăng ký Mira với giá $100 và $200/tháng, cho phép sử dụng Mira với hạn mức và khả năng cao nhất.',
    },
  },
] as const;

/** What the page renders: the approved items while `showPlans` is on. */
export function visibleComingSoon(show: boolean = showPlans) {
  return show ? comingSoon : [];
}
