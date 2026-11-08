'use client';
import { X } from '@tuturuuu/icons';
import { PLAYGROUND_LANGUAGES } from '@tuturuuu/types/primitives/playgrounds';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { ProgrammingResourcePicker } from './programming-resource-picker';

export type ProgrammingKind = 'problem' | 'playground';
export type ProgrammingLanguage = (typeof PLAYGROUND_LANGUAGES)[number];

/** Host-only resource chooser: one row of controls, framed as a card until a resource is open. */
export function ProgrammingSetup({
  wsId,
  accountId,
  kind,
  id,
  language,
  onKind,
  onId,
  onLanguage,
  onOpen,
  onCreate,
  onDismiss,
  pending,
}: {
  wsId?: string;
  accountId?: string;
  kind: ProgrammingKind;
  id: string;
  language: ProgrammingLanguage;
  onKind: (kind: ProgrammingKind) => void;
  onId: (id: string, language?: ProgrammingLanguage) => void;
  onLanguage: (language: ProgrammingLanguage) => void;
  onOpen: () => void;
  onCreate: () => void;
  /** Present while a resource is already open, so the row can be put away again. */
  onDismiss?: () => void;
  pending: boolean;
}) {
  const t = useTranslations('programmingPlayground');
  const framed = !onDismiss;
  return (
    <div
      className={cn(
        'shrink-0',
        framed
          ? 'm-auto w-full max-w-2xl space-y-3 rounded-xl border bg-background p-4'
          : 'flex items-center gap-2 border-b bg-background px-2 py-1.5'
      )}
    >
      {framed && <p className="font-medium text-sm">{t('setupTitle')}</p>}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <Select
          value={kind}
          onValueChange={(value) => onKind(value as ProgrammingKind)}
        >
          <SelectTrigger aria-label={t('resource')} className="h-8 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="playground">{t('playground')}</SelectItem>
            <SelectItem value="problem">{t('problem')}</SelectItem>
          </SelectContent>
        </Select>
        {wsId && accountId ? (
          <ProgrammingResourcePicker
            wsId={wsId}
            accountId={accountId}
            kind={kind}
            id={id}
            onSelect={onId}
          />
        ) : (
          <Input
            value={id}
            onChange={(event) => onId(event.target.value)}
            aria-label={t('resourceId')}
            placeholder={t('resourceId')}
            className="h-8 min-w-48 flex-1"
          />
        )}
        <Select
          value={language}
          onValueChange={(value) => onLanguage(value as ProgrammingLanguage)}
        >
          <SelectTrigger aria-label={t('language')} className="h-8 w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PLAYGROUND_LANGUAGES.filter(
              (value) => kind === 'playground' || value !== 'shell'
            ).map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" disabled={!id || pending} onClick={onOpen}>
          {t('open')}
        </Button>
        {kind === 'playground' && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={onCreate}
          >
            {t('create')}
          </Button>
        )}
        {onDismiss && (
          <Button
            size="icon"
            variant="ghost"
            className="ml-auto size-8"
            aria-label={t('hideSetup')}
            onClick={onDismiss}
          >
            <X className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
