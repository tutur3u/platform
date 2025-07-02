'use client';

import type { Workspace } from '@tuturuuu/types/db';
import { GetStartedButton } from '@tuturuuu/ui/custom/get-started-button';

export default function GetStartedWrapper({
  text,
  workspaces,
}: {
  text: string;
  workspaces: Workspace[];
}) {
  const wsId = workspaces?.[0]?.id;

  return (
    <GetStartedButton
      href={wsId ? `/${wsId}/home` : '/onboarding'}
      text={text}
    />
  );
}
