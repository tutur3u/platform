'use client';

import { Coffee, Lightbulb, Sparkles, Target } from '@tuturuuu/icons';
import type {
  MiraSoul,
  MiraSoulUpdate,
} from '@tuturuuu/internal-api/mira-soul';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { SettingsSection } from '@tuturuuu/ui/custom/settings-section';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import {
  currentPersonaStyle,
  matchingPersonaTemplate,
  PERSONA_TEMPLATE_KEYS,
  PERSONA_TEMPLATE_STYLES,
  type PersonaStyle,
  type PersonaTemplateKey,
  personaTemplateUpdate,
} from './mira-persona-templates';

const TEMPLATE_ICONS = {
  casual: Coffee,
  coach: Target,
  creative: Lightbulb,
  default: Sparkles,
} as const satisfies Record<PersonaTemplateKey, unknown>;

const STYLE_FIELDS = ['tone', 'vibe', 'chat_tone'] as const;

const STYLE_LABEL_KEYS = {
  chat_tone: 'chat_tone_label',
  tone: 'tone_label',
  vibe: 'vibe_label',
} as const satisfies Record<keyof PersonaStyle, string>;

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Translates a key built from a template key, which the typed `t` cannot see. */
function tKey(
  t: unknown,
  key: string,
  values?: Record<string, number>
): string {
  return (t as (key: string, values?: Record<string, number>) => string)(
    key,
    values
  );
}

/**
 * Template cards above the personality form. Choosing one previews the change
 * first; the personality text is replaced only when the user opts in.
 */
export function MiraPersonaTemplatePicker({
  disabled,
  onApply,
  soul,
}: {
  disabled: boolean;
  onApply: (key: PersonaTemplateKey, update: MiraSoulUpdate) => void;
  soul: MiraSoul | undefined;
}) {
  const t = useTranslations('settings.mira');
  const [openKey, setOpenKey] = useState<PersonaTemplateKey | null>(null);
  const current = currentPersonaStyle(soul);
  const matched = matchingPersonaTemplate(current);

  return (
    <SettingsSection
      title={t('persona_templates')}
      action={
        matched ? null : (
          <Badge variant="secondary">{t('template_custom')}</Badge>
        )
      }
      surface="plain"
    >
      <div className="grid @md:grid-cols-4 grid-cols-2 gap-2">
        {PERSONA_TEMPLATE_KEYS.map((key) => (
          <TemplateCard
            key={key}
            current={current}
            disabled={disabled}
            isCurrent={matched === key}
            open={openKey === key}
            onApply={(update) => {
              setOpenKey(null);
              onApply(key, update);
            }}
            onOpenChange={(open) => setOpenKey(open ? key : null)}
            personality={soul?.personality ?? ''}
            templateKey={key}
          />
        ))}
      </div>
    </SettingsSection>
  );
}

function TemplateCard({
  current,
  disabled,
  isCurrent,
  onApply,
  onOpenChange,
  open,
  personality,
  templateKey,
}: {
  current: PersonaStyle;
  disabled: boolean;
  isCurrent: boolean;
  onApply: (update: MiraSoulUpdate) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  personality: string;
  templateKey: PersonaTemplateKey;
}) {
  const t = useTranslations('settings.mira');
  const Icon = TEMPLATE_ICONS[templateKey];
  const style = PERSONA_TEMPLATE_STYLES[templateKey];

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex flex-col items-start gap-2 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
            isCurrent && 'border-foreground/40 bg-accent/40'
          )}
        >
          <span className="flex w-full items-center gap-2">
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate font-medium text-sm">
              {tKey(t, `template_${templateKey}`)}
            </span>
            {isCurrent && (
              <Badge variant="secondary">{t('template_current')}</Badge>
            )}
          </span>
          <span className="flex flex-wrap gap-1">
            {STYLE_FIELDS.map((field) => (
              <span
                key={field}
                className="rounded-full bg-muted px-2 text-muted-foreground text-xs leading-5"
              >
                {capitalize(style[field])}
              </span>
            ))}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-3">
        {open && (
          <TemplatePreview
            current={current}
            onApply={onApply}
            onCancel={() => onOpenChange(false)}
            personality={personality}
            templateKey={templateKey}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

function TemplatePreview({
  current,
  onApply,
  onCancel,
  personality,
  templateKey,
}: {
  current: PersonaStyle;
  onApply: (update: MiraSoulUpdate) => void;
  onCancel: () => void;
  personality: string;
  templateKey: PersonaTemplateKey;
}) {
  const t = useTranslations('settings.mira');
  const checkboxId = useId();
  const [replaceText, setReplaceText] = useState(false);
  const style = PERSONA_TEMPLATE_STYLES[templateKey];
  const text = tKey(t, `template_${templateKey}_personality`);

  return (
    <>
      <p className="font-medium text-sm">
        {tKey(t, `template_${templateKey}`)}
      </p>
      <dl className="space-y-1 text-sm">
        {STYLE_FIELDS.map((field) => (
          <div key={field} className="flex justify-between gap-3">
            <dt className="text-muted-foreground">
              {t(STYLE_LABEL_KEYS[field])}
            </dt>
            <dd>
              {current[field] === style[field]
                ? t('template_no_change')
                : `${capitalize(current[field])} → ${capitalize(style[field])}`}
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex items-start gap-2">
        <Checkbox
          id={checkboxId}
          checked={replaceText}
          onCheckedChange={(checked) => setReplaceText(checked === true)}
        />
        <label htmlFor={checkboxId} className="space-y-0.5 text-sm">
          <span className="block">{t('template_replace_text')}</span>
          <span className="block text-muted-foreground text-xs">
            {replaceText
              ? t('template_replace_text_on', { count: personality.length })
              : t('template_keep_text')}
          </span>
        </label>
      </div>
      {replaceText && (
        <p className="rounded-md bg-muted px-3 py-2 text-muted-foreground text-sm">
          {text}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" type="button" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button
          size="sm"
          type="button"
          onClick={() =>
            onApply(
              personaTemplateUpdate(templateKey, replaceText ? text : null)
            )
          }
        >
          {t('apply_template')}
        </Button>
      </div>
    </>
  );
}
