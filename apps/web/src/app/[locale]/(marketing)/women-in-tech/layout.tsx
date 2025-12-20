import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { type Locale, supportedLocales } from '@/i18n/routing';

interface Props {
  children: React.ReactNode;
  params: Promise<{
    locale: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;

  const isVietnamese = locale === 'vi';

  const title = isVietnamese
    ? 'Ngày Phụ Nữ Việt Nam 2025 - Tôn Vinh Phụ Nữ Trong Công Nghệ | Tuturuuu'
    : "Vietnamese Women's Day 2025 - Celebrating Women in Tech | Tuturuuu";

  const description = isVietnamese
    ? 'Tôn vinh Ngày Phụ Nữ Việt Nam (20/10) bằng cách ghi nhận những người phụ nữ tuyệt vời đã xây dựng Tuturuuu từ ngày đầu tiên. Từ Thư, kỹ sư đầu tiên, đến chị Quỳnh, COO đầu tiên, đến các đối tác AllMind, SPARK Hub, và RMIT—khám phá những câu chuyện chân thực về phụ nữ dẫn dắt trong công nghệ, từ Việt Nam ra thế giới.'
    : "Celebrating Vietnamese Women's Day (October 20th) by honoring the incredible women who built Tuturuuu from day one. From Thu, our first engineer, to Quynh, our first COO, to partnerships with AllMind, SPARK Hub, and RMIT—discover the authentic stories of women leading in technology, from Vietnam to the world.";

  const ogDescription = isVietnamese
    ? 'Tôn vinh những người phụ nữ tuyệt vời đã xây dựng Tuturuuu từ ngày đầu tiên—kỹ sư, lãnh đạo, và những người đổi mới định hình công nghệ từ Việt Nam ra thế giới.'
    : 'Celebrating the incredible women who built Tuturuuu from day one—engineers, leaders, and innovators shaping technology from Vietnam to the world.';

  const twitterDescription = isVietnamese
    ? 'Ghi nhận những người phụ nữ đã xây dựng Tuturuuu từ ngày đầu tiên—từ kỹ sư đầu tiên đến các đối tác toàn cầu. Kỷ niệm Ngày Phụ Nữ Việt Nam.'
    : "Honoring the women who built Tuturuuu from day one—from our first engineer to global partnerships. Celebrating Vietnamese Women's Day.";

  return {
    title,
    description,
    keywords: [
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
    ],
    openGraph: {
      title,
      description: ogDescription,
      type: 'website',
      locale: isVietnamese ? 'vi_VN' : 'en_US',
      alternateLocale: isVietnamese ? ['en_US'] : ['vi_VN'],
      siteName: 'Tuturuuu',
      images: [
        {
          url: '/media/marketing/events/women-in-tech/og.jpg',
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: twitterDescription,
      images: ['/media/marketing/events/women-in-tech/og.jpg'],
    },
    alternates: {
      canonical: `https://tuturuuu.com/${locale}/women-in-tech`,
      languages: {
        'vi-VN': 'https://tuturuuu.com/vi/women-in-tech',
        'en-US': 'https://tuturuuu.com/en/women-in-tech',
      },
    },
  };
}

export function generateStaticParams() {
  return supportedLocales.map((locale) => ({ locale }));
}

export default async function WomenInTechLayout({ children, params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  return <>{children}</>;
}
