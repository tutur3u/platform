import { redirect } from 'next/navigation';

export default async function LegacyMeetTogetherPage(props: {
  params: Promise<{
    slug: string[];
  }>;
}) {
  const { slug } = await props.params;
  console.log('slug', slug);
  redirect(`/meet-together${slug ? `/${slug.join('/')}` : ''}`);
}
