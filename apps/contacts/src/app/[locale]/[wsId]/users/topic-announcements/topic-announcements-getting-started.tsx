'use client';

import { ArrowRight, CheckCircle2, Sparkles, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useTopicAnnouncements } from './topic-announcements-context';

type StepTitleKey =
  | 'getting_started_step_contacts_title'
  | 'getting_started_step_verify_title'
  | 'getting_started_step_compose_title'
  | 'getting_started_step_send_title';

type StepDescKey =
  | 'getting_started_step_contacts_desc'
  | 'getting_started_step_verify_desc'
  | 'getting_started_step_compose_desc'
  | 'getting_started_step_send_desc';

type StepCtaKey =
  | 'getting_started_step_cta_contacts'
  | 'getting_started_step_cta_compose';

interface Step {
  key: string;
  titleKey: StepTitleKey;
  descKey: StepDescKey;
  ctaKey: StepCtaKey;
  segment: 'contacts' | 'announcements';
  done: boolean;
}

export function TopicAnnouncementsGettingStarted() {
  const t = useTranslations('ws-topic-announcements');
  const params = useParams<{ wsId: string }>();
  const { overview, wsId } = useTopicAnnouncements();
  const storageKey = `topic-announcements-getting-started-dismissed:${wsId}`;
  // Default to dismissed to avoid a flash before localStorage is read.
  const [isDismissed, setIsDismissed] = useState(true);

  useEffect(() => {
    setIsDismissed(localStorage.getItem(storageKey) === 'true');
  }, [storageKey]);

  const handleDismiss = () => {
    localStorage.setItem(storageKey, 'true');
    setIsDismissed(true);
  };

  if (isDismissed) return null;

  const routeWsId = params?.wsId ?? wsId;
  const steps: Step[] = [
    {
      key: 'contacts',
      titleKey: 'getting_started_step_contacts_title',
      descKey: 'getting_started_step_contacts_desc',
      ctaKey: 'getting_started_step_cta_contacts',
      segment: 'contacts',
      done: overview.contactCount > 0,
    },
    {
      key: 'verify',
      titleKey: 'getting_started_step_verify_title',
      descKey: 'getting_started_step_verify_desc',
      ctaKey: 'getting_started_step_cta_contacts',
      segment: 'contacts',
      done: overview.readyContactCount > 0,
    },
    {
      key: 'compose',
      titleKey: 'getting_started_step_compose_title',
      descKey: 'getting_started_step_compose_desc',
      ctaKey: 'getting_started_step_cta_compose',
      segment: 'announcements',
      done: overview.announcementCount > 0,
    },
    {
      key: 'send',
      titleKey: 'getting_started_step_send_title',
      descKey: 'getting_started_step_send_desc',
      ctaKey: 'getting_started_step_cta_compose',
      segment: 'announcements',
      done: overview.deliveredCount > 0,
    },
  ];

  const doneCount = steps.filter((step) => step.done).length;
  const allDone = doneCount === steps.length;
  // The next actionable step is the first one not yet completed.
  const activeIndex = steps.findIndex((step) => !step.done);

  return (
    <Card className="border-dynamic-blue/30 bg-dynamic-blue/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="space-y-0.5">
            <p className="font-semibold text-sm">
              {allDone
                ? t('getting_started_all_done')
                : t('getting_started_title')}
            </p>
            <p className="text-muted-foreground text-xs">
              {t('getting_started_progress', {
                done: doneCount.toString(),
                total: steps.length.toString(),
              })}
            </p>
          </div>
        </div>
        <Button
          aria-label={t('getting_started_dismiss')}
          className="h-7 w-7 shrink-0 text-foreground/60 hover:text-foreground"
          onClick={handleDismiss}
          size="icon"
          variant="ghost"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ol className="mt-4 grid gap-2 md:grid-cols-2">
        {steps.map((step, index) => {
          const isActive = index === activeIndex;
          return (
            <li
              className={cn(
                'flex items-start gap-3 rounded-lg border bg-background p-3',
                isActive ? 'border-dynamic-blue/40' : 'border-border/70'
              )}
              key={step.key}
            >
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs',
                  step.done
                    ? 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green'
                    : 'border-border text-muted-foreground'
                )}
              >
                {step.done ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <p
                  className={cn(
                    'font-medium text-sm',
                    step.done && 'text-muted-foreground line-through'
                  )}
                >
                  {t(step.titleKey)}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t(step.descKey)}
                </p>
                {!step.done ? (
                  <Link
                    className="inline-flex items-center gap-1 font-medium text-dynamic-blue text-xs hover:underline"
                    href={`/${routeWsId}/users/topic-announcements/${step.segment}`}
                  >
                    {t(step.ctaKey)}
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
