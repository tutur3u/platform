'use client';

import { RequestAccessButton } from './request-access-button';
import { BookOpenText, Sparkles } from '@tuturuuu/ui/icons';
import clsx from 'clsx';

interface EducationBannerProps {
  workspaceName: string | null;
  wsId: string;
  className?: string;
}

export function EducationBanner({
  workspaceName,
  wsId,
  className,
}: EducationBannerProps) {
  return (
    <div
      className={clsx(
        'relative overflow-hidden rounded-xl border border-dynamic-blue/30 bg-gradient-to-br from-dynamic-blue/10 via-dynamic-blue/5 to-dynamic-blue/10 p-6 shadow-sm backdrop-blur-sm transition-all duration-300 hover:shadow-md dark:border-dynamic-blue/40 dark:from-dynamic-blue/15 dark:via-dynamic-blue/10 dark:to-dynamic-blue/15',
        className
      )}
    >
      {/* Decorative elements */}
      <div className="bg-grid-pattern absolute inset-0 opacity-[0.02] dark:opacity-[0.04]"></div>
      <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-dynamic-blue/20 blur-3xl"></div>
      <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-dynamic-blue/15 blur-3xl"></div>

      <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-dynamic-blue to-dynamic-blue/80 shadow-lg ring-4 ring-dynamic-blue/20 transition-transform duration-200 hover:scale-105">
            <BookOpenText className="h-7 w-7 text-white" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-foreground">
                Unlock Education Features
              </h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-dynamic-blue/10 px-2.5 py-0.5 text-xs font-medium text-dynamic-blue ring-1 ring-dynamic-blue/20">
                <Sparkles className="h-3 w-3" />
                Request Access
              </span>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Transform your workspace with comprehensive learning tools: create
              courses, design interactive quizzes, track student progress, issue
              certificates, and leverage AI-powered teaching assistants.
            </p>
          </div>
        </div>

        <RequestAccessButton workspaceName={workspaceName} wsId={wsId} />
      </div>
    </div>
  );
}
