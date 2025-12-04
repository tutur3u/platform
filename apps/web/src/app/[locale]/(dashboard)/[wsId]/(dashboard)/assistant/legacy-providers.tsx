'use client';

import { LiveAPIProvider } from '@/hooks/use-live-api';
import { useParams } from 'next/navigation';

const API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY as string;
const host = 'generativelanguage.googleapis.com';
const uri = `wss://${host}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent`;

export function LegacyProviders({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const wsId = params.wsId as string;

  return (
    <LiveAPIProvider url={uri} apiKey={API_KEY} wsId={wsId}>
      {children}
    </LiveAPIProvider>
  );
}
