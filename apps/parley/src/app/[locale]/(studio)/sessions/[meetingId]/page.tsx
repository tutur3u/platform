import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  NotebookPen,
  Users,
} from '@tuturuuu/icons';
import { MeetingLocalTime } from '@tuturuuu/meet-core/features/call/components/meeting-local-time';
import { getMeetCallAccess } from '@tuturuuu/meet-core/features/call/lib/call-access';
import { encodeRoomCode } from '@tuturuuu/meet-core/features/call/lib/room-code';
import { MeetingAiOverview } from '@tuturuuu/meet-core/features/meeting-ai/meeting-ai-overview';
import { requireParleyUser } from '@tuturuuu/meet-core/parley/authorization';
import {
  getFacilitatorNotes,
  getSessionScenario,
} from '@tuturuuu/meet-core/parley/repository';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { ResearchNotes } from '@/features/studio/research-notes';

export default async function Review({
  params,
  searchParams,
}: {
  params: Promise<{ meetingId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  await connection();
  const user = await requireParleyUser();
  const { meetingId } = await params;
  if (!z.uuid().safeParse(meetingId).success) notFound();
  const page = Math.min(
    10000,
    Math.max(0, Number.parseInt((await searchParams).page ?? '0', 10) || 0)
  );
  const notes = await getFacilitatorNotes(meetingId, user.id, page);
  if (!notes) notFound();
  const access = await getMeetCallAccess(meetingId, 'Participant');
  if (!access.isHost) notFound();
  const scenario = await getSessionScenario(meetingId);
  if (!scenario) notFound();
  const t = await getTranslations('parley');
  return (
    <>
      <Button asChild variant="ghost">
        <Link href="/sessions">
          <ArrowLeft className="size-4" />
          {t('sessions')}
        </Link>
      </Button>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="font-medium text-muted-foreground text-sm">
            {t('review')} · {scenario.category}
          </p>
          <h1 className="font-semibold text-3xl tracking-tight">
            {scenario.title}
          </h1>
          <p className="text-muted-foreground text-sm">
            <MeetingLocalTime value={scenario.createdAt} pattern="PPP p" />
            {' · '}
            {t('revision', { revision: scenario.revision })}
          </p>
          <p className="max-w-2xl text-muted-foreground">{t('review_hint')}</p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/r/${encodeRoomCode(meetingId)}`}>
            {t('open_room')}
            <ArrowUpRight className="size-4" />
          </Link>
        </Button>
      </header>
      <section
        aria-label={t('breakdown')}
        className="grid divide-y rounded-xl border bg-card sm:grid-cols-3 sm:divide-x sm:divide-y-0"
      >
        {[
          { icon: Users, label: t('roles'), value: scenario.roles.length },
          { icon: NotebookPen, label: t('notes'), value: notes.total },
          {
            icon: BookOpen,
            label: t('decisions'),
            value: notes.decisions,
          },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="p-5">
            <p className="flex items-center gap-2 text-muted-foreground text-sm">
              <Icon className="size-4" />
              {label}
            </p>
            <p className="mt-2 font-semibold text-2xl tabular-nums">{value}</p>
          </div>
        ))}
      </section>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <section className="space-y-3">
            <h2 className="font-semibold text-lg">{t('extracted')}</h2>
            <p className="text-muted-foreground text-sm">
              {t('extracted_hint')}
            </p>
            <MeetingAiOverview
              wsId={access.meeting.ws_id}
              meetingId={meetingId}
            />
          </section>
          <details className="rounded-xl border p-5">
            <summary className="cursor-pointer font-semibold">
              {t('briefing')}
            </summary>
            <p className="mt-4 whitespace-pre-wrap text-muted-foreground text-sm leading-relaxed">
              {scenario.briefing}
            </p>
          </details>
        </div>
        <ResearchNotes
          meetingId={meetingId}
          notes={notes.notes}
          page={page}
          hasMore={notes.hasMore}
        />
      </div>
      <p className="border-t pt-5 text-muted-foreground text-xs">
        {t('research_note')}
      </p>
    </>
  );
}
