'use client';

import {
  ArrowRight,
  CheckCircle2,
  LayoutDashboard,
  NotebookPen,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

interface EmptyStateProps {
  wsId: string;
  onSwitchToJournal: () => void;
  onCreateTask?: () => void;
}

export default function EmptyState({
  wsId,
  onSwitchToJournal,
  onCreateTask,
}: EmptyStateProps) {
  const t = useTranslations();

  const handleJournalClick = () => {
    onSwitchToJournal();
    // Scroll to top to show the journal content
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  };

  return (
    <Card className="border-2 border-dynamic-muted/50 border-dashed">
      <CardContent className="px-6 py-16 text-center">
        <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-linear-to-br from-dynamic-blue/10 via-dynamic-purple/10 to-dynamic-pink/10">
          <CheckCircle2 className="h-12 w-12 text-dynamic-blue" />
        </div>
        <h3 className="mb-3 font-bold text-2xl">{t('ws-tasks.no_tasks')}</h3>
        <p className="mx-auto mb-8 max-w-md text-muted-foreground">
          {t('ws-tasks.no_tasks_assigned')}
        </p>

        <div className="mx-auto max-w-2xl space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Button
              className="h-[88px] w-full flex-col gap-2 py-4 sm:flex-row"
              onClick={onCreateTask}
            >
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <div className="flex flex-col items-center gap-0.5">
                <span className="font-semibold">Create Task</span>
                <span className="text-xs opacity-90">Quick task creation</span>
              </div>
            </Button>

            <Link href={`/${wsId}/tasks/boards`} className="w-full">
              <Button
                variant="outline"
                className="h-[88px] w-full flex-col gap-2 border-2 py-4 sm:flex-row"
              >
                <LayoutDashboard className="h-5 w-5 shrink-0" />
                <div className="flex flex-col items-center gap-0.5">
                  <span className="font-semibold">Go to Boards</span>
                  <span className="text-xs opacity-75">Browse all boards</span>
                </div>
              </Button>
            </Link>

            <Button
              variant="outline"
              className="h-[88px] w-full flex-col gap-2 border-2 py-4 sm:flex-row"
              onClick={handleJournalClick}
            >
              <NotebookPen className="h-5 w-5 shrink-0" />
              <div className="flex flex-col items-center gap-0.5">
                <span className="font-semibold">Try Quick Journal</span>
                <span className="text-xs opacity-75">AI-powered creation</span>
              </div>
            </Button>
          </div>

          <div className="rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/5 p-4">
            <div className="flex items-start gap-3 text-left">
              <div className="rounded-full bg-dynamic-blue/10 p-2">
                <ArrowRight className="h-4 w-4 text-dynamic-blue" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-foreground text-sm">Quick Tip</p>
                <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
                  Tasks created in any board or through Quick Journal will
                  appear here. You can also use the Bucket Dump to capture quick
                  ideas!
                </p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
