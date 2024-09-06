import { getPermissions } from '@/lib/workspace-helper';
import { redirect } from 'next/navigation';

export default async function ChatLayout({
  children,
  params: { wsId },
}: {
  children: React.ReactNode;
  params: {
    wsId: string;
  };
}) {
  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('ai_chat')) redirect(`/${wsId}`);

  return (
    // <MicrophoneContextProvider>
    // <DeepgramContextProvider>
    children
    // </DeepgramContextProvider>
    // </MicrophoneContextProvider>
  );
}
