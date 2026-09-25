import { getMeetCallAccess } from '@tuturuuu/meet-core/features/call/lib/call-access';
import { decodeRoomCode } from '@tuturuuu/meet-core/features/call/lib/room-code';
import { requireParleyUser } from '@tuturuuu/meet-core/parley/authorization';
import { parleyDatabase } from '@tuturuuu/meet-core/parley/database';
import { getSessionScenario } from '@tuturuuu/meet-core/parley/repository';
import RoomPage from '@tuturuuu/meet-core/routes/[locale]/r/[code]/page';
import { Button } from '@tuturuuu/ui/button';
import { Textarea } from '@tuturuuu/ui/textarea';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { saveObservation } from '@/features/studio/actions';

export default async function Session(props: {
  params: Promise<{ code: string; locale: string }>;
  searchParams: Promise<{ notes?: string }>;
}) {
  await connection();
  await requireParleyUser();
  const { code } = await props.params;
  const id = decodeRoomCode(code);
  if (!id) notFound();
  const access = await getMeetCallAccess(id, 'Participant');
  const scenario = await getSessionScenario(id);
  if (!scenario) notFound();
  const t = await getTranslations('parley');
  const notes = access.isHost
    ? await (await parleyDatabase())
        .schema('private')
        .from('parley_observations')
        .select('id, kind, content, created_at')
        .eq('meeting_id', id)
        .order('created_at', { ascending: false })
        .limit(50)
    : null;
  if (notes?.error) throw new Error('Observations unavailable');
  return (
    <>
      <details className="relative z-10 border-b bg-background px-5 py-3">
        <summary className="cursor-pointer font-medium">
          {t('briefing')} · {scenario.title}
        </summary>
        <div className="mx-auto grid max-w-6xl gap-6 py-5 md:grid-cols-2">
          <section className="space-y-3">
            <p className="whitespace-pre-wrap text-sm">{scenario.briefing}</p>
            <p className="text-muted-foreground text-xs">{t('ai_hint')}</p>
            <p className="text-muted-foreground text-xs">{t('consent')}</p>
            <a className="text-sm underline" href="/">
              {t('library')}
            </a>
            {access.isHost && (
              <Button asChild variant="outline">
                <Link href={`/sessions/${id}`}>{t('review')}</Link>
              </Button>
            )}
          </section>
          {access.isHost && (
            <section className="space-y-4">
              <form action={saveObservation} className="space-y-3">
                <input type="hidden" name="meeting_id" value={id} />
                <label className="block text-sm">
                  {t('note_type')}
                  <select
                    name="kind"
                    className="ml-3 rounded border bg-background p-2"
                  >
                    <option value="observation">{t('observation')}</option>
                    <option value="decision">{t('decision')}</option>
                    <option value="debrief">{t('debrief')}</option>
                  </select>
                </label>
                <label className="block text-sm">
                  {t('notes')}
                  <Textarea
                    name="content"
                    required
                    maxLength={8000}
                    className="mt-2"
                  />
                </label>
                <Button type="submit">{t('save_note')}</Button>
              </form>
              <div className="max-h-64 space-y-3 overflow-auto">
                {notes?.data?.map((note) => (
                  <article key={note.id} className="rounded-lg border p-3">
                    <p className="text-muted-foreground text-xs">
                      {t(note.kind as 'observation' | 'decision' | 'debrief')}
                    </p>
                    <p className="whitespace-pre-wrap text-sm">
                      {note.content}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      </details>
      <RoomPage {...props} />
    </>
  );
}
