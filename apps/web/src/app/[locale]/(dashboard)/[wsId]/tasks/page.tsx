import { redirect } from 'next/navigation';

export default async function TasksPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  redirect(`/${wsId}/tasks/my-tasks`);
}
