'use client';
import { useMutation } from '@tanstack/react-query';
import { Plus, Trash2 } from '@tuturuuu/icons';
import type {
  ProgrammingAuthorProblem,
  ProgrammingProblemInput,
} from '@tuturuuu/types/primitives/programming';
import { PROGRAMMING_CATALOG_CASE_LIMIT } from '@tuturuuu/types/primitives/programming';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Textarea } from '@tuturuuu/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { programmingFont } from '../coding/coding-font';
import { saveProgrammingProblem } from './actions';

const empty: ProgrammingProblemInput = {
  slug: '',
  title: { en: '', vi: '' },
  prompt: { en: '', vi: '' },
  starterCode: '',
  difficulty: 'easy',
  topic: 'arrays',
  status: 'draft',
  cases: [{ input: '', expected: '', visible: true }],
};
export function ProgrammingProblemForm({
  wsId,
  problem,
}: {
  wsId: string;
  problem?: ProgrammingAuthorProblem;
}) {
  const t = useTranslations('programming');
  const coding = useTranslations('coding');
  const router = useRouter();
  const formId = useId();
  const [value, setValue] = useState<ProgrammingProblemInput>(
    problem
      ? {
          slug: problem.slug,
          title: problem.title,
          prompt: problem.prompt,
          starterCode: problem.starterCode,
          difficulty: problem.difficulty,
          topic: problem.topic,
          status: problem.status,
          cases: problem.cases,
        }
      : empty
  );
  const [caseIds, setCaseIds] = useState(() =>
    value.cases.map((_, index) => `initial-${index}`)
  );
  const save = useMutation({
    mutationFn: async () => {
      const result = await saveProgrammingProblem(
        wsId,
        problem?.id,
        problem?.revision,
        value
      );
      if (!result.ok)
        throw new Error(
          result.status === 409
            ? 'revisionConflict'
            : result.status === 400
              ? 'invalidPayload'
              : 'saveFailed'
        );
      return result;
    },
    onSuccess: (result) => {
      router.push(`/${wsId}/programming/problems/${result.id}?mode=author`);
      router.refresh();
    },
  });
  const field = (key: keyof ProgrammingProblemInput, next: unknown) =>
    setValue((previous) => ({ ...previous, [key]: next }));
  const caseField = (
    index: number,
    key: 'input' | 'expected' | 'visible',
    next: string | boolean
  ) =>
    setValue((previous) => ({
      ...previous,
      cases: previous.cases.map((test, position) =>
        position === index ? { ...test, [key]: next } : test
      ),
    }));
  return (
    <form
      className={`mx-auto w-full max-w-5xl space-y-6 ${programmingFont.variable} [--font-mono:var(--font-programming-mono)]`}
      onSubmit={(event) => {
        event.preventDefault();
        if (!save.isPending) save.mutate();
      }}
    >
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="flex-1 font-semibold text-2xl">
          {t(problem ? 'edit' : 'create')}
        </h1>
        <Button asChild variant="outline">
          <Link href={`/${wsId}/programming?mode=author`}>{t('cancel')}</Link>
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {t(save.isPending ? 'saving' : 'save')}
        </Button>
      </header>
      {save.error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-foreground"
        >
          {t(
            save.error.message === 'revisionConflict'
              ? 'revisionConflict'
              : save.error.message === 'invalidPayload'
                ? 'invalidPayload'
                : 'saveFailed'
          )}
        </p>
      )}
      <div className="space-y-2">
        <Label htmlFor={`${formId}-slug`}>{t('slug')}</Label>
        <Input
          id={`${formId}-slug`}
          required
          maxLength={80}
          pattern={'[a-z0-9\\-]{1,80}'}
          value={value.slug}
          onChange={(event) => field('slug', event.target.value)}
        />
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {(['en', 'vi'] as const).map((locale) => (
          <section key={locale} className="space-y-3">
            <h2 className="font-medium">
              {t(locale === 'en' ? 'english' : 'vietnamese')}
            </h2>
            <div className="space-y-2">
              <Label htmlFor={`${formId}-${locale}-title`}>
                {t('problemTitle')}
              </Label>
              <Input
                id={`${formId}-${locale}-title`}
                required
                maxLength={255}
                value={value.title[locale]}
                onChange={(event) =>
                  field('title', {
                    ...value.title,
                    [locale]: event.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${formId}-${locale}-prompt`}>
                {t('prompt')}
              </Label>
              <Textarea
                id={`${formId}-${locale}-prompt`}
                required
                rows={7}
                maxLength={16000}
                value={value.prompt[locale]}
                onChange={(event) =>
                  field('prompt', {
                    ...value.prompt,
                    [locale]: event.target.value,
                  })
                }
              />
            </div>
          </section>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {(['difficulty', 'topic', 'status'] as const).map((key) => (
          <div className="space-y-2" key={key}>
            <Label htmlFor={`${formId}-${key}`}>{t(key)}</Label>
            <Select
              value={value[key]}
              onValueChange={(next) => field(key, next)}
            >
              <SelectTrigger id={`${formId}-${key}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(key === 'difficulty'
                  ? ['easy', 'medium']
                  : key === 'topic'
                    ? ['arrays', 'search', 'stacks']
                    : ['draft', 'published', 'archived']
                ).map((option) => (
                  <SelectItem key={option} value={option}>
                    {key === 'status'
                      ? t(option as 'draft' | 'published' | 'archived')
                      : coding(
                          `${key === 'topic' ? 'topics' : 'difficulty'}.${option}`
                        )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${formId}-starter`}>{t('starterCode')}</Label>
        <Textarea
          id={`${formId}-starter`}
          className="font-mono"
          rows={7}
          maxLength={16000}
          value={value.starterCode}
          onChange={(event) => field('starterCode', event.target.value)}
        />
      </div>
      <section className="space-y-3">
        <header className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">{t('testCases')}</h2>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="outline"
                aria-label={t('addCase')}
                disabled={value.cases.length >= PROGRAMMING_CATALOG_CASE_LIMIT}
                onClick={() => {
                  setValue((previous) => ({
                    ...previous,
                    cases: [
                      ...previous.cases,
                      { input: '', expected: '', visible: false },
                    ],
                  }));
                  setCaseIds((previous) => [...previous, crypto.randomUUID()]);
                }}
              >
                <Plus className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('addCase')}</TooltipContent>
          </Tooltip>
        </header>
        <p className="text-muted-foreground text-sm">{t('casesHint')}</p>
        <Accordion type="multiple">
          {value.cases.map((test, index) => (
            <AccordionItem key={caseIds[index]} value={caseIds[index]!}>
              <AccordionTrigger>
                {t('caseNumber', { number: index + 1 })}
              </AccordionTrigger>
              <AccordionContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  {(['input', 'expected'] as const).map((key) => (
                    <div key={key} className="space-y-2">
                      <Label
                        htmlFor={`${formId}-case-${caseIds[index]}-${key}`}
                      >
                        {t(key)}
                      </Label>
                      <Textarea
                        id={`${formId}-case-${caseIds[index]}-${key}`}
                        className="font-mono"
                        rows={3}
                        maxLength={4096}
                        value={test[key]}
                        onChange={(event) =>
                          caseField(index, key, event.target.value)
                        }
                      />
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`${formId}-visible-${caseIds[index]}`}
                      checked={test.visible}
                      onCheckedChange={(next) =>
                        caseField(index, 'visible', next === true)
                      }
                    />
                    <Label htmlFor={`${formId}-visible-${caseIds[index]}`}>
                      {t('visibleCase')}
                    </Label>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t('removeCase')}
                        disabled={value.cases.length <= 1}
                        onClick={() => {
                          setValue((previous) => ({
                            ...previous,
                            cases: previous.cases.filter(
                              (_, position) => position !== index
                            ),
                          }));
                          setCaseIds((previous) =>
                            previous.filter((_, position) => position !== index)
                          );
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('removeCase')}</TooltipContent>
                  </Tooltip>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </form>
  );
}
