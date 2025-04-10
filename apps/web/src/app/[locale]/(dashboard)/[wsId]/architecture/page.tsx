import { redirect } from 'next/navigation';

export default function ArchitecturePage({
  params,
}: {
  params: { wsId: string };
}) {
  redirect(`/${params.wsId}/architecture/mvp`);
}
