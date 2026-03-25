'use client';

import { CalendarDays, Palette, Sparkles } from '@tuturuuu/icons';
import type {
  HabitTracker,
  HabitTrackerInput,
} from '@tuturuuu/types/primitives/HabitTracker';
import { SUPPORTED_COLORS } from '@tuturuuu/types/primitives/SupportedColors';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  Dialog,
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
import { Separator } from '@tuturuuu/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import {
  getHabitTrackerTemplate,
  HABIT_TRACKER_TEMPLATES,
} from '@/lib/habit-trackers/templates';
import TrackerFieldBuilder, { type FieldDraft } from './tracker-field-builder';
import {
  getTrackerColorClasses,
  ICON_OPTIONS,
  normalizeQuickAddValues,
  TrackerIcon,
} from './tracker-shared';

const DEFAULT_TEMPLATE = HABIT_TRACKER_TEMPLATES[0]!;

function createFieldDraft(
  field: HabitTrackerInput['input_schema'][number]
): FieldDraft {
  return {
    ...field,
    manualKey: false,
    optionsText: field.options?.map((option) => option.value).join(', ') ?? '',
    unit: field.unit ?? '',
  };
}

function buildInputFromTracker(tracker?: HabitTracker): HabitTrackerInput {
  if (tracker) {
    return {
      aggregation_strategy: tracker.aggregation_strategy,
      color: tracker.color,
      description: tracker.description ?? '',
      freeze_allowance: tracker.freeze_allowance,
      icon: tracker.icon,
      input_schema: tracker.input_schema,
      is_active: tracker.is_active,
      name: tracker.name,
      primary_metric_key: tracker.primary_metric_key,
      quick_add_values: tracker.quick_add_values,
      recovery_window_periods: tracker.recovery_window_periods,
      start_date: tracker.start_date,
      target_operator: tracker.target_operator,
      target_period: tracker.target_period,
      target_value: tracker.target_value,
      tracking_mode: tracker.tracking_mode,
    };
  }

  const template = getHabitTrackerTemplate('water') ?? DEFAULT_TEMPLATE;

  return {
    aggregation_strategy: template.aggregation_strategy,
    color: template.color,
    description: template.description,
    freeze_allowance: template.freeze_allowance,
    icon: template.icon,
    input_schema: template.input_schema,
    is_active: true,
    name: template.name,
    primary_metric_key: template.primary_metric_key,
    quick_add_values: template.quick_add_values,
    recovery_window_periods: template.recovery_window_periods,
    start_date: new Date().toISOString().slice(0, 10),
    target_operator: template.target_operator,
    target_period: template.target_period,
    target_value: template.target_value,
    tracking_mode: template.tracking_mode,
  };
}

function buildFieldDrafts(input: HabitTrackerInput) {
  return input.input_schema.map((field) => createFieldDraft(field));
}

export default function TrackerFormDialog({
  onOpenChange,
  onSubmit,
  open,
  submitting = false,
  tracker,
}: {
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: HabitTrackerInput) => Promise<void> | void;
  open: boolean;
  submitting?: boolean;
  tracker?: HabitTracker | null;
}) {
  const t = useTranslations('habit-tracker.form');
  const [activeTab, setActiveTab] = useState('basics');
  const [draft, setDraft] = useState<HabitTrackerInput>(() =>
    buildInputFromTracker(tracker ?? undefined)
  );
  const [fields, setFields] = useState<FieldDraft[]>(() =>
    buildFieldDrafts(buildInputFromTracker(tracker ?? undefined))
  );
  const [quickAddInput, setQuickAddInput] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    tracker ? 'custom' : 'water'
  );

  useEffect(() => {
    const nextDraft = buildInputFromTracker(tracker ?? undefined);
    setActiveTab('basics');
    setDraft(nextDraft);
    setFields(buildFieldDrafts(nextDraft));
    setQuickAddInput('');
    setSelectedTemplateId(tracker ? 'custom' : 'water');
  }, [tracker]);

  const primaryField =
    fields.find((field) => field.key === draft.primary_metric_key) ?? fields[0];
  const quickAddValues = normalizeQuickAddValues(draft.quick_add_values ?? []);
  const canSubmit =
    draft.name.trim().length > 0 &&
    fields.length > 0 &&
    fields.every((field) => field.label.trim() && field.key.trim());

  function applyTemplate(templateId: string) {
    const template = getHabitTrackerTemplate(templateId);
    if (!template) return;

    setSelectedTemplateId(templateId);
    setDraft((current) => ({
      ...current,
      aggregation_strategy: template.aggregation_strategy,
      color: template.color,
      description: template.description,
      freeze_allowance: template.freeze_allowance,
      icon: template.icon,
      name: template.name,
      primary_metric_key: template.primary_metric_key,
      quick_add_values: template.quick_add_values,
      recovery_window_periods: template.recovery_window_periods,
      target_operator: template.target_operator,
      target_period: template.target_period,
      target_value: template.target_value,
      tracking_mode: template.tracking_mode,
    }));
    setFields(template.input_schema.map((field) => createFieldDraft(field)));
  }

  function addQuickValue() {
    const nextValue = Number(quickAddInput);
    if (!Number.isFinite(nextValue) || nextValue <= 0) {
      setQuickAddInput('');
      return;
    }

    setDraft((current) => ({
      ...current,
      quick_add_values: normalizeQuickAddValues([
        ...(current.quick_add_values ?? []),
        nextValue,
      ]),
    }));
    setQuickAddInput('');
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex h-[min(92vh,880px)] max-w-[calc(100%-1rem)] flex-col overflow-hidden rounded-[28px] border-border/70 p-0 sm:max-w-5xl">
        <DialogHeader className="border-border/70 border-b px-6 pt-6 pb-5">
          <DialogTitle>
            {tracker ? t('edit_title') : t('create_title')}
          </DialogTitle>
          <DialogDescription>
            {tracker ? t('edit_description') : t('create_description')}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-6">
            {!tracker ? (
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-dynamic-cyan" />
                  <Label>{t('template_label')}</Label>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {HABIT_TRACKER_TEMPLATES.map((template) => {
                    const colorClasses = getTrackerColorClasses(template.color);
                    const selected = selectedTemplateId === template.id;

                    return (
                      <button
                        className={cn(
                          'rounded-[24px] border p-4 text-left transition-all',
                          selected
                            ? 'border-foreground/20 bg-card shadow-sm'
                            : 'border-border/70 bg-background/80 hover:border-border hover:bg-card'
                        )}
                        key={template.id}
                        onClick={() => applyTemplate(template.id)}
                        type="button"
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={cn(
                              'rounded-2xl border p-3',
                              colorClasses.badge,
                              colorClasses.border,
                              colorClasses.text
                            )}
                          >
                            <TrackerIcon icon={template.icon} />
                          </div>
                          <div className="space-y-1">
                            <p className="font-semibold text-sm">
                              {template.name}
                            </p>
                            <p className="line-clamp-2 text-muted-foreground text-sm">
                              {template.description}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge variant="outline">
                            {template.target_value} {t(template.target_period)}
                          </Badge>
                          <Badge variant="secondary">
                            {t(template.tracking_mode)}
                          </Badge>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <Tabs
              className="space-y-4"
              onValueChange={setActiveTab}
              value={activeTab}
            >
              <TabsList className="grid h-auto w-full grid-cols-3 rounded-2xl border border-border/70 bg-muted/40 p-1">
                <TabsTrigger className="rounded-xl px-4 py-2" value="basics">
                  {t('basics_tab')}
                </TabsTrigger>
                <TabsTrigger className="rounded-xl px-4 py-2" value="goal">
                  {t('goal_tab')}
                </TabsTrigger>
                <TabsTrigger className="rounded-xl px-4 py-2" value="advanced">
                  {t('advanced_tab')}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="basics">
                <div className="space-y-5">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Palette className="h-4 w-4" />
                    <span>{t('basics_description')}</span>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
                    <div className="space-y-4 rounded-[24px] border border-border/70 bg-background/70 p-5">
                      <div className="space-y-2">
                        <Label htmlFor="tracker-name">{t('name')}</Label>
                        <Input
                          id="tracker-name"
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              name: event.target.value,
                            }))
                          }
                          value={draft.name}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="tracker-description">
                          {t('description')}
                        </Label>
                        <Textarea
                          id="tracker-description"
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              description: event.target.value,
                            }))
                          }
                          rows={4}
                          value={draft.description ?? ''}
                        />
                      </div>
                    </div>

                    <div className="space-y-4 rounded-[24px] border border-border/70 bg-background/70 p-5">
                      <div className="space-y-2">
                        <Label htmlFor="tracker-start-date">
                          {t('start_date')}
                        </Label>
                        <div className="relative">
                          <CalendarDays className="absolute top-3 left-3 h-4 w-4 text-muted-foreground" />
                          <Input
                            className="pl-10"
                            id="tracker-start-date"
                            onChange={(event) =>
                              setDraft((current) => ({
                                ...current,
                                start_date: event.target.value,
                              }))
                            }
                            type="date"
                            value={draft.start_date}
                          />
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>{t('color')}</Label>
                          <Select
                            onValueChange={(value) =>
                              setDraft((current) => ({
                                ...current,
                                color: value as HabitTrackerInput['color'],
                              }))
                            }
                            value={draft.color}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SUPPORTED_COLORS.map((color) => (
                                <SelectItem key={color} value={color}>
                                  {color}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>{t('icon')}</Label>
                          <Select
                            onValueChange={(value) =>
                              setDraft((current) => ({
                                ...current,
                                icon: value,
                              }))
                            }
                            value={draft.icon}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ICON_OPTIONS.map((icon) => (
                                <SelectItem key={icon} value={icon}>
                                  {icon}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <label className="flex items-center gap-3 rounded-2xl border border-border/70 px-4 py-3">
                        <Checkbox
                          checked={draft.is_active}
                          id="tracker-active"
                          onCheckedChange={(checked) =>
                            setDraft((current) => ({
                              ...current,
                              is_active: checked === true,
                            }))
                          }
                        />
                        <div>
                          <p className="font-medium text-sm">{t('status')}</p>
                          <p className="text-muted-foreground text-sm">
                            {t('is_active')}
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="goal">
                <div className="space-y-5">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Sparkles className="h-4 w-4" />
                    <span>{t('goal_description')}</span>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-[1.1fr,0.9fr]">
                    <div className="space-y-4 rounded-[24px] border border-border/70 bg-background/70 p-5">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>{t('tracking_mode')}</Label>
                          <Select
                            onValueChange={(value) =>
                              setDraft((current) => ({
                                ...current,
                                tracking_mode:
                                  value as HabitTrackerInput['tracking_mode'],
                              }))
                            }
                            value={draft.tracking_mode}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="event_log">
                                {t('event_log')}
                              </SelectItem>
                              <SelectItem value="daily_summary">
                                {t('daily_summary')}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>{t('aggregation_strategy')}</Label>
                          <Select
                            onValueChange={(value) =>
                              setDraft((current) => ({
                                ...current,
                                aggregation_strategy:
                                  value as HabitTrackerInput['aggregation_strategy'],
                              }))
                            }
                            value={draft.aggregation_strategy}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="sum">{t('sum')}</SelectItem>
                              <SelectItem value="max">{t('max')}</SelectItem>
                              <SelectItem value="count_entries">
                                {t('count_entries')}
                              </SelectItem>
                              <SelectItem value="boolean_any">
                                {t('boolean_any')}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                          <Label>{t('target_period')}</Label>
                          <Select
                            onValueChange={(value) =>
                              setDraft((current) => ({
                                ...current,
                                target_period:
                                  value as HabitTrackerInput['target_period'],
                              }))
                            }
                            value={draft.target_period}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="daily">
                                {t('daily')}
                              </SelectItem>
                              <SelectItem value="weekly">
                                {t('weekly')}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>{t('target_operator')}</Label>
                          <Select
                            onValueChange={(value) =>
                              setDraft((current) => ({
                                ...current,
                                target_operator:
                                  value as HabitTrackerInput['target_operator'],
                              }))
                            }
                            value={draft.target_operator}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="gte">
                                {t('at_least')}
                              </SelectItem>
                              <SelectItem value="eq">{t('exactly')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="tracker-target-value">
                            {t('target_value')}
                          </Label>
                          <Input
                            id="tracker-target-value"
                            min={1}
                            onChange={(event) =>
                              setDraft((current) => ({
                                ...current,
                                target_value: Math.max(
                                  1,
                                  Number(event.target.value || 1)
                                ),
                              }))
                            }
                            type="number"
                            value={draft.target_value}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>{t('primary_metric')}</Label>
                        <Select
                          onValueChange={(value) =>
                            setDraft((current) => ({
                              ...current,
                              primary_metric_key: value,
                            }))
                          }
                          value={
                            fields.some(
                              (field) => field.key === draft.primary_metric_key
                            )
                              ? draft.primary_metric_key
                              : fields[0]?.key
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {fields.map((field) => (
                              <SelectItem key={field.key} value={field.key}>
                                {field.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-[24px] border border-border/70 bg-background/70 p-5">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-sm">
                              {t('summary_preview')}
                            </p>
                            <p className="text-muted-foreground text-sm">
                              {draft.tracking_mode === 'daily_summary'
                                ? t('daily_summary')
                                : t('event_log')}
                            </p>
                          </div>
                          <div
                            className={cn(
                              'rounded-2xl border p-3',
                              getTrackerColorClasses(draft.color).badge,
                              getTrackerColorClasses(draft.color).border,
                              getTrackerColorClasses(draft.color).text
                            )}
                          >
                            <TrackerIcon icon={draft.icon} />
                          </div>
                        </div>

                        <Separator className="my-4" />

                        <div className="space-y-2 text-sm">
                          <p className="font-medium">
                            {draft.name || t('create_title')}
                          </p>
                          <p className="text-muted-foreground">
                            {draft.target_operator === 'gte'
                              ? t('at_least')
                              : t('exactly')}{' '}
                            {draft.target_value}{' '}
                            {primaryField?.unit ||
                              primaryField?.label ||
                              t('primary_metric')}{' '}
                            {t(draft.target_period)}
                          </p>
                          <p className="text-muted-foreground">
                            {primaryField?.label || t('primary_metric')}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-[24px] border border-border/70 bg-background/70 p-5">
                        <div className="space-y-3">
                          <Label htmlFor="quick-add-input">
                            {t('quick_add_values')}
                          </Label>
                          <div className="flex gap-2">
                            <Input
                              id="quick-add-input"
                              inputMode="decimal"
                              onChange={(event) =>
                                setQuickAddInput(event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  addQuickValue();
                                }
                              }}
                              placeholder={t('quick_add_input')}
                              type="number"
                              value={quickAddInput}
                            />
                            <Button
                              onClick={addQuickValue}
                              type="button"
                              variant="outline"
                            >
                              {t('add_quick_value')}
                            </Button>
                          </div>

                          {quickAddValues.length === 0 ? (
                            <p className="text-muted-foreground text-sm">
                              {t('quick_add_empty')}
                            </p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {quickAddValues.map((value) => (
                                <button
                                  className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-sm transition-colors hover:bg-muted"
                                  key={value}
                                  onClick={() =>
                                    setDraft((current) => ({
                                      ...current,
                                      quick_add_values: quickAddValues.filter(
                                        (item) => item !== value
                                      ),
                                    }))
                                  }
                                  type="button"
                                >
                                  <span>+{value}</span>
                                  <span className="text-muted-foreground">
                                    {t('remove_quick_value')}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="advanced">
                <div className="space-y-5">
                  <div className="text-muted-foreground text-sm">
                    {t('advanced_description')}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2 rounded-[24px] border border-border/70 bg-background/70 p-5">
                      <Label htmlFor="freeze-allowance">
                        {t('freeze_allowance')}
                      </Label>
                      <Input
                        id="freeze-allowance"
                        min={0}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            freeze_allowance: Math.max(
                              0,
                              Number(event.target.value || 0)
                            ),
                          }))
                        }
                        type="number"
                        value={draft.freeze_allowance ?? 0}
                      />
                    </div>

                    <div className="space-y-2 rounded-[24px] border border-border/70 bg-background/70 p-5">
                      <Label htmlFor="recovery-window">
                        {t('recovery_window_periods')}
                      </Label>
                      <Input
                        id="recovery-window"
                        min={0}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            recovery_window_periods: Math.max(
                              0,
                              Number(event.target.value || 0)
                            ),
                          }))
                        }
                        type="number"
                        value={draft.recovery_window_periods ?? 0}
                      />
                    </div>
                  </div>

                  <TrackerFieldBuilder
                    fields={fields}
                    labels={{
                      addField: t('add_field'),
                      boolean: t('boolean'),
                      duration: t('duration'),
                      fieldKey: t('field_key'),
                      fieldKeyHint: t('field_key_hint'),
                      fieldLabel: t('field_label'),
                      fieldOptions: t('field_options'),
                      fieldType: t('field_type'),
                      fieldUnit: t('field_unit'),
                      fieldsDescription: t('fields_description'),
                      fieldsTitle: t('fields_title'),
                      number: t('number'),
                      removeField: t('remove_field'),
                      required: t('required'),
                      select: t('select'),
                      text: t('text'),
                    }}
                    onChange={setFields}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <DialogFooter className="border-border/70 border-t px-6 py-4">
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            {t('cancel')}
          </Button>
          <Button
            disabled={!canSubmit || submitting}
            onClick={async () => {
              await onSubmit({
                ...draft,
                input_schema: fields.map((field) => ({
                  key: field.key,
                  label: field.label,
                  options:
                    field.type === 'select' && field.optionsText
                      ? field.optionsText
                          .split(',')
                          .map((value) => value.trim())
                          .filter(Boolean)
                          .map((value) => ({
                            label: value,
                            value,
                          }))
                      : undefined,
                  required: field.required,
                  type: field.type,
                  unit: field.unit || undefined,
                })),
                primary_metric_key:
                  draft.primary_metric_key || fields[0]?.key || 'value',
                quick_add_values: quickAddValues,
              });
            }}
            type="button"
          >
            {tracker ? t('save_changes') : t('create_tracker')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
