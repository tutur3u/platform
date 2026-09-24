import { ArrowUpRight, AudioLines, BookOpen, Users } from '@tuturuuu/icons';
import { requireParleyUser } from '@tuturuuu/meet-core/parley/authorization';
import { listScenarios } from '@tuturuuu/meet-core/parley/repository';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { joinScenario, startScenario } from '@/features/studio/actions';

export default async function Studio() {
  await connection();
  const user = await requireParleyUser();
  const t = await getTranslations('parley');
  const scenarios = await listScenarios();
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-5 py-6 md:px-10">
      <header className="flex items-center justify-between border-b pb-6">
        <a href="/" className="font-semibold text-xl tracking-tight">
          parley
          <span className="ml-3 font-normal text-muted-foreground text-xs">
            TUTURUUU
          </span>
        </a>
        <div className="flex items-center gap-4 text-sm">
          <span className="hidden text-muted-foreground sm:inline">
            {user.email}
          </span>
          <a
            href="https://ai.tuturuuu.com/personal/credits"
            className="underline underline-offset-4"
          >
            {t('ai_credits')}
          </a>
          <a
            href="https://tuturuuu.com"
            className="underline underline-offset-4"
          >
            {t('account')}
          </a>
        </div>
      </header>
      <section className="grid gap-8 border-b py-12 lg:grid-cols-[1fr_360px]">
        <div>
          <p className="mb-4 font-mono text-muted-foreground text-xs uppercase tracking-widest">
            {t('eyebrow')}
          </p>
          <h1 className="max-w-2xl font-semibold text-4xl leading-tight tracking-tight md:text-5xl">
            {t('title')}
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            {t('description')}
          </p>
          <div className="mt-7 flex flex-wrap gap-5 text-sm">
            <span className="flex items-center gap-2">
              <Users className="size-4" />
              {t('multiplayer')}
            </span>
            <span className="flex items-center gap-2">
              <AudioLines className="size-4" />
              {t('live_ai')}
            </span>
            <span className="flex items-center gap-2">
              <BookOpen className="size-4" />
              {t('debrief')}
            </span>
          </div>
        </div>
        <form
          action={joinScenario}
          className="space-y-4 self-end rounded-2xl border bg-muted/30 p-6"
        >
          <h2 className="font-semibold">{t('join')}</h2>
          <label className="block space-y-2 text-sm">
            <span>{t('room_code')}</span>
            <Input name="code" required maxLength={80} autoComplete="off" />
          </label>
          <Button type="submit" className="w-full">
            {t('join')}
            <ArrowUpRight className="size-4" />
          </Button>
        </form>
      </section>
      <section className="py-9">
        <div className="mb-5 flex items-end justify-between">
          <h2 className="font-semibold text-xl">{t('library')}</h2>
          <span className="font-mono text-muted-foreground text-sm">
            {String(scenarios.length).padStart(2, '0')}
          </span>
        </div>
        {scenarios.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-12 text-center">
            <h3 className="font-medium">{t('empty_title')}</h3>
            <p className="mx-auto mt-2 max-w-lg text-muted-foreground text-sm">
              {t('empty_body')}
            </p>
          </div>
        ) : (
          <div className="divide-y rounded-2xl border">
            {scenarios.map((scenario, index) => (
              <article
                key={scenario.id}
                className="grid gap-6 p-6 md:grid-cols-[48px_1fr_260px]"
              >
                <span className="font-mono text-muted-foreground text-sm">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div>
                  <p className="mb-2 text-muted-foreground text-xs uppercase tracking-wider">
                    {scenario.category}
                  </p>
                  <h3 className="font-semibold text-xl">{scenario.title}</h3>
                  <p className="mt-2 whitespace-pre-wrap text-muted-foreground text-sm">
                    {scenario.briefing}
                  </p>
                  <p className="mt-4 text-xs">
                    {scenario.roles.map((role) => role.name).join(' · ')}
                  </p>
                </div>
                <form action={startScenario} className="space-y-4">
                  <input type="hidden" name="scenario_id" value={scenario.id} />
                  <label className="flex items-start gap-2 text-muted-foreground text-xs">
                    <input
                      className="mt-0.5"
                      type="checkbox"
                      name="consent"
                      required
                    />
                    <span>{t('consent')}</span>
                  </label>
                  <Button className="w-full" type="submit">
                    {t('start')}
                    <ArrowUpRight className="size-4" />
                  </Button>
                </form>
              </article>
            ))}
          </div>
        )}
      </section>
      <footer className="border-t py-6 text-muted-foreground text-xs">
        {t('research_note')}
      </footer>
    </main>
  );
}
