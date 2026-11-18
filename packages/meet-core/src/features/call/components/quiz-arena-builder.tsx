'use client';

import { BookOpen, Sparkles } from '@tuturuuu/icons';
import type { ArenaConfigInput } from '@tuturuuu/realtime/meet/room-quiz-arena';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Switch } from '@tuturuuu/ui/switch';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { type ReactNode, useId, useState } from 'react';
import {
  ARENA_GRADES,
  ARENA_SUBJECTS,
  type ArenaGrade,
  type ArenaSubject,
} from '../lib/quiz-arena-options';
import type {
  QuizArenaAction,
  QuizArenaActionResult,
} from '../server/quiz-arena';

type Courses = NonNullable<QuizArenaActionResult['courses']>;

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-full bg-muted p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'h-8 rounded-full px-3 font-bold text-xs focus-visible:outline-2 focus-visible:outline-ring',
            value === option.value
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1">
      <span className="font-bold text-muted-foreground text-xs">{label}</span>
      {children}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-2">
      <label htmlFor={id} className="font-bold text-sm">
        {label}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

const COUNTS = ['3', '4', '5'] as const;

export function QuizArenaBuilder({
  busy,
  locale,
  miraUnavailable,
  courses,
  onAction,
  onCancel,
}: {
  busy: boolean;
  locale: 'en' | 'vi';
  miraUnavailable: boolean;
  courses: Courses | null;
  onAction: (action: QuizArenaAction) => void;
  onCancel?: () => void;
}) {
  const t = useTranslations('meet.call.quizArena');
  const [subject, setSubject] = useState<ArenaSubject>('general');
  const [grade, setGrade] = useState<ArenaGrade>('10');
  const [topic, setTopic] = useState('');
  const [categoriesCount, setCategories] = useState(5);
  const [tiersCount, setTiers] = useState(5);
  const [answerMode, setAnswerMode] = useState<'buzz_in' | 'all_answer'>(
    'all_answer'
  );
  const [playMode, setPlayMode] = useState<'individual' | 'teams'>(
    'individual'
  );
  const [teamCount, setTeamCount] = useState(4);
  const [bonusTiles, setBonusTiles] = useState(true);
  const [finalRound, setFinalRound] = useState(true);
  const [speedBonus, setSpeedBonus] = useState(false);
  const [penalty, setPenalty] = useState<'none' | 'half' | 'full'>('none');
  const [courseId, setCourseId] = useState('');
  const [moduleId, setModuleId] = useState('all');
  const config: ArenaConfigInput = {
    answerMode,
    playMode,
    speedBonus,
    wrongAnswerPenalty: penalty,
    ...(playMode === 'teams'
      ? {
          teams: Array.from({ length: teamCount }, (_, i) =>
            t('team_name', { number: i + 1 })
          ),
        }
      : {}),
  };
  const request = {
    subject,
    grade,
    ...(topic.trim() ? { topic: topic.trim() } : {}),
    categoriesCount,
    tiersCount,
    locale,
    includeFinalRound: finalRound,
    bonusTiles,
  };
  const course = courses?.find(({ id }) => id === courseId);
  const gradeLabel = (value: ArenaGrade) =>
    value === 'K'
      ? t('grade_k')
      : value === 'university'
        ? t('grade_university')
        : t('grade_n', { number: value });
  return (
    <section
      aria-label={t('setup_title')}
      className="space-y-3 rounded-2xl border border-border bg-card p-3"
    >
      <h3 className="font-extrabold text-base">{t('setup_title')}</h3>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('subject')}>
          <Select
            value={subject}
            onValueChange={(value) => setSubject(value as ArenaSubject)}
          >
            <SelectTrigger aria-label={t('subject')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ARENA_SUBJECTS.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`subject_${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t('grade')}>
          <Select
            value={grade}
            onValueChange={(value) => setGrade(value as ArenaGrade)}
          >
            <SelectTrigger aria-label={t('grade')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ARENA_GRADES.map((value) => (
                <SelectItem key={value} value={value}>
                  {gradeLabel(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t('categories_count')}>
          <Select
            value={String(categoriesCount)}
            onValueChange={(value) => setCategories(Number(value))}
          >
            <SelectTrigger aria-label={t('categories_count')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COUNTS.map((n) => (
                <SelectItem key={n} value={n}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t('tiers_count')}>
          <Select
            value={String(tiersCount)}
            onValueChange={(value) => setTiers(Number(value))}
          >
            <SelectTrigger aria-label={t('tiers_count')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COUNTS.map((n) => (
                <SelectItem key={n} value={n}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label={t('topic')}>
        <Input
          value={topic}
          maxLength={200}
          onChange={(event) => setTopic(event.target.value)}
        />
      </Field>

      <div className="space-y-2 border-border border-t pt-3">
        <Segmented
          label={t('answer_mode')}
          value={answerMode}
          onChange={setAnswerMode}
          options={[
            { value: 'all_answer', label: t('mode_all_answer') },
            { value: 'buzz_in', label: t('mode_buzz_in') },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label={t('play_mode')}
            value={playMode}
            onChange={setPlayMode}
            options={[
              { value: 'individual', label: t('mode_individual') },
              { value: 'teams', label: t('mode_teams') },
            ]}
          />
          {playMode === 'teams' && (
            <Select
              value={String(teamCount)}
              onValueChange={(value) => setTeamCount(Number(value))}
            >
              <SelectTrigger
                aria-label={t('teams_count')}
                className="h-8 w-auto"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 11 }, (_, i) => String(i + 2)).map(
                  (n) => (
                    <SelectItem key={n} value={n}>
                      {t('teams_option', { count: Number(n) })}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          )}
        </div>
        <Toggle
          label={t('bonus_tiles')}
          checked={bonusTiles}
          onChange={setBonusTiles}
        />
        <Toggle
          label={t('final_round')}
          checked={finalRound}
          onChange={setFinalRound}
        />
        <Toggle
          label={t('speed_bonus')}
          checked={speedBonus}
          onChange={setSpeedBonus}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-sm">{t('wrong_penalty')}</span>
          <Select
            value={penalty}
            onValueChange={(value) => setPenalty(value as typeof penalty)}
          >
            <SelectTrigger
              aria-label={t('wrong_penalty')}
              className="h-8 w-auto"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t('penalty_none')}</SelectItem>
              <SelectItem value="half">{t('penalty_half')}</SelectItem>
              <SelectItem value="full">{t('penalty_full')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {miraUnavailable && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-xl bg-muted p-2 text-sm"
        >
          {t('mira_unavailable')}
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            disabled={busy}
            onClick={() =>
              onAction({
                action: 'mira_generate_board',
                request,
                config,
                useStarterFallback: true,
              })
            }
          >
            {t('use_starter')}
          </Button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy}
          className="bg-dynamic-purple text-background hover:bg-dynamic-purple/90"
          onClick={() =>
            onAction({ action: 'mira_generate_board', request, config })
          }
        >
          <Sparkles className="size-4" />
          {busy ? t('generating') : t('generate_with_mira')}
        </Button>
        {courses === null && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => onAction({ action: 'list_upskii' })}
          >
            <BookOpen className="size-4" />
            {t('import_upskii')}
          </Button>
        )}
        {onCancel && (
          <Button variant="ghost" className="ml-auto" onClick={onCancel}>
            {t('cancel')}
          </Button>
        )}
      </div>

      {courses && (
        <div className="space-y-2 border-border border-t pt-3">
          <b className="text-sm">{t('import_upskii')}</b>
          {courses.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('upskii_none')}</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={courseId}
                onValueChange={(value) => {
                  setCourseId(value);
                  setModuleId('all');
                }}
              >
                <SelectTrigger aria-label={t('course')}>
                  <SelectValue placeholder={t('course')} />
                </SelectTrigger>
                <SelectContent>
                  {courses.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={moduleId}
                disabled={!course}
                onValueChange={setModuleId}
              >
                <SelectTrigger aria-label={t('module')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('all_modules')}</SelectItem>
                  {course?.modules.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                className="col-span-2"
                disabled={busy || !course}
                onClick={() =>
                  onAction({
                    action: 'import_upskii',
                    courseId,
                    ...(moduleId !== 'all' ? { moduleId } : {}),
                    bonusTiles,
                    includeFinalRound: finalRound,
                    config,
                  })
                }
              >
                <BookOpen className="size-4" />
                {t('import')}
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
