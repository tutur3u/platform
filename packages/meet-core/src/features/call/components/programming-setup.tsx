'use client';
import { CodeXml, ListChecks, Loader2 } from '@tuturuuu/icons';
import { PLAYGROUND_LANGUAGES } from '@tuturuuu/types/primitives/playgrounds';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { type ComponentType, useId } from 'react';
import { PROGRAMMING_LANGUAGE_LABELS } from './programming-languages';
import { ProgrammingResourcePicker } from './programming-resource-picker';

export type ProgrammingKind = 'problem' | 'playground';
export type ProgrammingLanguage = (typeof PLAYGROUND_LANGUAGES)[number];

function KindChoice({
  value,
  selected,
  icon: Icon,
  title,
  hint,
  onSelect,
}: {
  value: ProgrammingKind;
  selected: boolean;
  icon: ComponentType<{ className?: string }>;
  title: string;
  hint: string;
  onSelect: (value: ProgrammingKind) => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => onSelect(value)}
      className={cn(
        'flex min-h-16 min-w-0 flex-1 items-start gap-3 rounded-[var(--radius-xl)] border bg-card p-3.5 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
        selected && 'border-foreground bg-accent'
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span className="grid min-w-0 gap-0.5">
        <span className="font-semibold text-sm">{title}</span>
        <span className="text-muted-foreground text-xs">{hint}</span>
      </span>
    </button>
  );
}

/**
 * The host's "Open Co-Programming" dialog: resource kind as two choices,
 * then the project or problem and its language as labelled selects. An empty
 * playground id means a new playground from the language's template.
 */
export function ProgrammingSetup({
  open,
  onOpenChange,
  wsId,
  accountId,
  kind,
  id,
  language,
  languageLocked = false,
  onKind,
  onId,
  onLanguage,
  onOpen,
  onCreate,
  pending,
  failed = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wsId?: string;
  accountId?: string;
  kind: ProgrammingKind;
  id: string;
  language: ProgrammingLanguage;
  /** A saved playground keeps its project language. */
  languageLocked?: boolean;
  onKind: (kind: ProgrammingKind) => void;
  onId: (id: string, language?: ProgrammingLanguage) => void;
  onLanguage: (language: ProgrammingLanguage) => void;
  onOpen: () => void;
  onCreate: () => void;
  pending: boolean;
  failed?: boolean;
}) {
  const t = useTranslations('programmingPlayground');
  const resourceId = useId();
  const languageId = useId();
  const createsPlayground = kind === 'playground' && !id;
  const canOpen = !pending && (kind === 'playground' || !!id);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 rounded-[var(--radius-2xl)] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('openTitle')}</DialogTitle>
          <DialogDescription>{t('openDescription')}</DialogDescription>
        </DialogHeader>
        <div
          role="radiogroup"
          aria-label={t('resource')}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <KindChoice
            value="playground"
            selected={kind === 'playground'}
            icon={CodeXml}
            title={t('playgroundChoice')}
            hint={t('kindPlaygroundHint')}
            onSelect={onKind}
          />
          <KindChoice
            value="problem"
            selected={kind === 'problem'}
            icon={ListChecks}
            title={t('problem')}
            hint={t('kindProblemHint')}
            onSelect={onKind}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="grid min-w-0 content-start gap-2">
            <Label htmlFor={resourceId}>
              {t(kind === 'playground' ? 'projectLabel' : 'problemLabel')}
            </Label>
            {wsId && accountId ? (
              <ProgrammingResourcePicker
                triggerId={resourceId}
                wsId={wsId}
                accountId={accountId}
                kind={kind}
                id={id}
                onSelect={onId}
              />
            ) : (
              <Input
                id={resourceId}
                value={id}
                onChange={(event) => onId(event.target.value)}
                placeholder={t('resourceId')}
                className="h-10 rounded-full"
              />
            )}
          </div>
          <div className="grid min-w-0 content-start gap-2">
            <Label htmlFor={languageId}>{t('language')}</Label>
            <Select
              value={language}
              disabled={languageLocked}
              onValueChange={(value) => {
                const chosen = PLAYGROUND_LANGUAGES.find(
                  (item) => item === value
                );
                if (chosen) onLanguage(chosen);
              }}
            >
              <SelectTrigger
                id={languageId}
                aria-label={t('language')}
                className="h-10 w-full rounded-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLAYGROUND_LANGUAGES.filter(
                  (value) => kind === 'playground' || value !== 'shell'
                ).map((value) => (
                  <SelectItem key={value} value={value}>
                    {PROGRAMMING_LANGUAGE_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="-mt-2 text-muted-foreground text-xs">
          {languageLocked
            ? t('languageLocked')
            : t(kind === 'playground' ? 'playgroundHelp' : 'problemHelp')}
        </p>
        {failed && (
          <p role="alert" className="text-destructive text-sm">
            {t('openFailed')}
          </p>
        )}
        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button variant="outline" className="rounded-full">
              {t('cancel')}
            </Button>
          </DialogClose>
          <Button
            className="rounded-full"
            disabled={!canOpen}
            onClick={createsPlayground ? onCreate : onOpen}
          >
            {pending && (
              <Loader2
                aria-hidden="true"
                className="size-4 animate-spin motion-reduce:animate-none"
              />
            )}
            {t('open')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
