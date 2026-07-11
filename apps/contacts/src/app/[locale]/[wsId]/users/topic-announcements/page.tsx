import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ wsId: string }>;
}

export default async function TopicAnnouncementsIndexPage({
  params,
}: PageProps) {
  const { wsId } = await params;
  redirect(`/${wsId}/users/topic-announcements/announcements`);
}
