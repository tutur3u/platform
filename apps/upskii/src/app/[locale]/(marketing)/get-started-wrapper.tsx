'use client';

import { Workspace } from '@tuturuuu/types/db';
import { GetStartedButton } from '@tuturuuu/ui/custom/get-started-button';
import { notFound } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function GetStartedWrapper({ text }: { text: string }) {
  const [wsId, setWsId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchWsId() {
      const workspaces = await getWorkspaces();
      setWsId(workspaces?.[0]?.id || null);
    }
    fetchWsId();
  }, []);

  return (
    <GetStartedButton
      href={wsId ? `/${wsId}/home` : '/onboarding'}
      disabled={!wsId && wsId !== null}
      text={text}
    />
  );
}

async function getWorkspaces() {
  const response = await fetch('/api/v1/workspaces');
  if (!response.ok) notFound();

  const data = await response.json();
  return data as Workspace[];
}
