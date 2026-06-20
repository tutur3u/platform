import type { Locale } from '../../lib/platform/locale';
import englishContent from './en.json';
import vietnameseContent from './vi.json';

export type WomenInTechContent = typeof englishContent;
export type LeadershipKey =
  | 'engineering'
  | 'executives'
  | 'marketing'
  | 'remote';
export type ImpactStatKey = 'growth' | 'innovation' | 'leadership';
export type ValueKey =
  | 'collaboration'
  | 'excellence'
  | 'excellence-tech'
  | 'growth'
  | 'inclusion'
  | 'innovation';
export type AchievementKey = 'community' | 'founding' | 'growth' | 'mentorship';
export type GlobalImpactKey = 'future' | 'global' | 'vietnam';
export type DiversityKey = 'creativity' | 'market' | 'perspective';
export type ColleagueKey = 'henry' | 'khang' | 'khoi' | 'phuc' | 'sam';
export type PartnershipKey =
  | 'allmind'
  | 'community'
  | 'dai'
  | 'nhu'
  | 'nhung'
  | 'rmit'
  | 'soki'
  | 'sparkHub';

export const womenInTechContentByLocale: Record<Locale, WomenInTechContent> = {
  en: englishContent,
  vi: vietnameseContent as WomenInTechContent,
};

export const womenInTechMetadataByLocale = {
  en: {
    title: "Vietnamese Women's Day 2025 - Celebrating Women in Tech | Tuturuuu",
    description:
      "Celebrating Vietnamese Women's Day (October 20th) by honoring the incredible women who built Tuturuuu from day one. From Thu, our first engineer, to Quynh, our first COO, to partnerships with AllMind, SPARK Hub, and RMIT-discover the authentic stories of women leading in technology, from Vietnam to the world.",
    ogDescription:
      'Celebrating the incredible women who built Tuturuuu from day one-engineers, leaders, and innovators shaping technology from Vietnam to the world.',
    twitterDescription:
      "Honoring the women who built Tuturuuu from day one-from our first engineer to global partnerships. Celebrating Vietnamese Women's Day.",
    ogLocale: 'en_US',
    alternateLocale: 'vi_VN',
  },
  vi: {
    title:
      'Ngày Phụ Nữ Việt Nam 2025 - Tôn Vinh Phụ Nữ Trong Công Nghệ | Tuturuuu',
    description:
      'Tôn vinh Ngày Phụ Nữ Việt Nam (20/10) bằng cách ghi nhận những người phụ nữ tuyệt vời đã xây dựng Tuturuuu từ ngày đầu tiên. Từ Thư, kỹ sư đầu tiên, đến chị Quỳnh, COO đầu tiên, đến các đối tác AllMind, SPARK Hub, và RMIT-khám phá những câu chuyện chân thực về phụ nữ dẫn dắt trong công nghệ, từ Việt Nam ra thế giới.',
    ogDescription:
      'Tôn vinh những người phụ nữ tuyệt vời đã xây dựng Tuturuuu từ ngày đầu tiên-kỹ sư, lãnh đạo, và những người đổi mới định hình công nghệ từ Việt Nam ra thế giới.',
    twitterDescription:
      'Ghi nhận những người phụ nữ đã xây dựng Tuturuuu từ ngày đầu tiên-từ kỹ sư đầu tiên đến các đối tác toàn cầu. Kỷ niệm Ngày Phụ Nữ Việt Nam.',
    ogLocale: 'vi_VN',
    alternateLocale: 'en_US',
  },
} as const;

export const womenInTechKeywords = [
  "Vietnamese Women's Day",
  'Ngày Phụ Nữ Việt Nam',
  'Women in Tech',
  'Phụ Nữ Trong Công Nghệ',
  'Tuturuuu',
  'Women Engineers',
  'Kỹ Sư Nữ',
  'Vietnam Tech',
  'Women Leadership',
  'Software Engineering',
  'RMIT',
  'SPARK Hub',
  'AllMind',
  'Tech Diversity',
  'Women Empowerment',
];

export function getWomenInTechContent(locale: Locale) {
  return womenInTechContentByLocale[locale];
}

export function getWomenInTechMetadata(locale: Locale) {
  return womenInTechMetadataByLocale[locale];
}
