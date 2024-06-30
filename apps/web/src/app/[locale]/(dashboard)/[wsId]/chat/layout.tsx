import { DeepgramContextProvider } from '@/hooks/useDeepgram';
import { MicrophoneContextProvider } from '@/hooks/useMicrophone';

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MicrophoneContextProvider>
      <DeepgramContextProvider>{children}</DeepgramContextProvider>
    </MicrophoneContextProvider>
  );
}
