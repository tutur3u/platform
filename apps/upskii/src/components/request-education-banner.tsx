'use client';

import { RequestAccessButton } from './request-access-button';
import clsx from 'clsx';
import { BookOpenText, Sparkles } from 'lucide-react';

interface EducationBannerProps {
  workspaceName: string;
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
        'relative overflow-hidden rounded-xl border border-blue-100/50 bg-gradient-to-br from-blue-50/80 via-indigo-50/80 to-violet-50/80 p-6 shadow-sm dark:border-blue-900/30 dark:from-blue-950/30 dark:via-indigo-950/30 dark:to-violet-950/30',
        className
      )}
    >
      {/* Decorative elements */}
      <div className="bg-grid-pattern absolute inset-0 opacity-[0.03] dark:opacity-[0.06]"></div>
      <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-blue-200/20 blur-3xl dark:bg-blue-400/10"></div>
      <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-violet-200/30 blur-3xl dark:bg-violet-400/10"></div>

      <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg ring-4 ring-blue-500/10 dark:from-blue-600 dark:to-indigo-700 dark:ring-blue-600/20">
            <BookOpenText className="h-7 w-7 text-white" />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-foreground">
                Unlock Education Features
              </h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-blue-500/10 to-indigo-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:from-blue-400/20 dark:to-indigo-400/20 dark:text-blue-300">
                <Sparkles className="h-3 w-3" /> New
              </span>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Transform your workspace with courses, interactive quizzes,
              certificates, and AI-powered teaching tools.
            </p>
          </div>
        </div>

        <RequestAccessButton workspaceName={workspaceName} wsId={wsId} />
      </div>
    </div>
  );
}
