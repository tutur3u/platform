'use client';

import { GraduationCap } from '@tuturuuu/icons';
import type {
  TulearnBootstrapResponse,
  TulearnWorkspaceSummary,
} from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import {
  LearnerHeader,
  LearnerNavDock,
  useSelectedStudentId,
} from './learner-shell-parts';

export function LearnerShell({
  bootstrap,
  children,
  wsId,
}: {
  bootstrap: TulearnBootstrapResponse;
  children: ReactNode;
  wsId: string;
}) {
  const selectedStudentId = useSelectedStudentId();

  return (
    <div className="min-h-screen overflow-x-hidden bg-root-background">
      <LearnerNavDock selectedStudentId={selectedStudentId} wsId={wsId} />
      <main className="min-h-screen pb-44 md:pb-8 md:pl-32">
        <LearnerHeader
          bootstrap={bootstrap}
          selectedStudentId={selectedStudentId}
          wsId={wsId}
        />
        <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}

export function NoWorkspaceState() {
  const t = useTranslations();
  return (
    <div className="flex min-h-screen items-center justify-center bg-root-background p-6">
      <div className="max-w-lg border-2 border-border bg-background p-8 text-center shadow-[9px_9px_0_var(--border)]">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center border-2 border-border bg-dynamic-yellow/15 shadow-[4px_4px_0_var(--border)]">
          <GraduationCap className="h-8 w-8" />
        </div>
        <h1 className="font-black text-3xl tracking-normal">
          {t('workspace.empty')}
        </h1>
        <p className="mt-3 text-muted-foreground leading-7">
          {t('auth.subtitle')}
        </p>
      </div>
    </div>
  );
}

export type { TulearnWorkspaceSummary };
