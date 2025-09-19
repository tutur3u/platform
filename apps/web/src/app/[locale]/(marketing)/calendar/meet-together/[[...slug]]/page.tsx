import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Meet Together Calendar',
  description:
    'Explore calendar templates and resources for Meet Together events.',
};

export default async function LegacyMeetTogetherPage(props: {
  params: Promise<{
    slug: string[];
  }>;
}) {
  const { slug } = await props.params;
  console.log('slug', slug);
  redirect(`/meet-together${slug ? `/${slug.join('/')}` : ''}`);
}
