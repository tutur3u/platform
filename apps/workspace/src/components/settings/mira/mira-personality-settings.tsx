'use client';

import type { MiraSoulUpdate } from '@tuturuuu/internal-api/mira-soul';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { SettingsSection } from '@tuturuuu/ui/custom/settings-section';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import {
  useMiraSoul,
  useUpdateMiraSoul,
} from '../../../app/[locale]/(dashboard)/[wsId]/(dashboard)/hooks/use-mira-soul';
import { MiraPersonaTemplatePicker } from './mira-persona-template-picker';
import {
  type PersonaTemplateKey,
  personaUndoUpdate,
} from './mira-persona-templates';

const TONE_OPTIONS = [
  'balanced',
  'casual',
  'formal',
  'friendly',
  'playful',
  'professional',
  'warm',
] as const;

const VIBE_OPTIONS = [
  'calm',
  'energetic',
  'friendly',
  'neutral',
  'playful',
  'warm',
  'witty',
] as const;

const CHAT_TONE_OPTIONS = ['thorough', 'concise', 'detailed', 'brief'] as const;

export function MiraPersonalitySettings() {
  const t = useTranslations('settings.mira');
  const { data: soul, isLoading } = useMiraSoul();
  const { mutate: updateSoul, isPending } = useUpdateMiraSoul();

  const handleUpdate = useCallback(
    (field: string, value: string) => {
      updateSoul({ [field]: value });
    },
    [updateSoul]
  );

  const handleApplyTemplate = useCallback(
    (key: PersonaTemplateKey, update: MiraSoulUpdate) => {
      const undo = soul ? personaUndoUpdate(soul, update) : null;
      updateSoul(update, {
        onSuccess: () => {
          toast.success(
            t('template_applied', {
              name: t(`template_${key}` as Parameters<typeof t>[0]),
            }),
            undo
              ? {
                  action: {
                    label: t('template_undo'),
                    onClick: () => updateSoul(undo),
                  },
                }
              : undefined
          );
        },
        onError: () => toast.error(t('template_apply_error')),
      });
    },
    [soul, t, updateSoul]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <MiraPersonaTemplatePicker
        disabled={isPending}
        onApply={handleApplyTemplate}
        soul={soul}
      />

      <SettingsSection title={t('identity_title')}>
        {/* Name */}
        <SettingItemTab
          title={t('name_label')}
          description={t('name_description')}
          controlWidth="xl"
        >
          <Input
            defaultValue={soul?.name ?? 'Mira'}
            maxLength={50}
            disabled={isPending}
            onBlur={(e) => {
              const value = e.target.value.trim();
              if (value && value !== soul?.name) {
                handleUpdate('name', value);
              }
            }}
          />
        </SettingItemTab>

        {/* Vibe */}
        <SettingItemTab
          title={t('vibe_label')}
          description={t('vibe_description')}
        >
          <Select
            value={soul?.vibe ?? 'warm'}
            onValueChange={(value) => handleUpdate('vibe', value)}
            disabled={isPending}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VIBE_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingItemTab>

        {/* Personality */}
        <SettingItemTab
          layout="stacked"
          title={t('personality_label')}
          description={t('personality_description_field')}
        >
          <Textarea
            // Remount when a template or undo changes the saved text.
            key={soul?.personality ?? ''}
            defaultValue={soul?.personality ?? ''}
            maxLength={2000}
            rows={3}
            disabled={isPending}
            className="resize-none"
            onBlur={(e) => {
              const value = e.target.value.trim();
              if (value !== (soul?.personality ?? '')) {
                handleUpdate('personality', value);
              }
            }}
          />
        </SettingItemTab>
      </SettingsSection>

      <SettingsSection title={t('behavior_title')}>
        {/* Tone */}
        <SettingItemTab
          title={t('tone_label')}
          description={t('tone_description')}
        >
          <Select
            value={soul?.tone ?? 'balanced'}
            onValueChange={(value) => handleUpdate('tone', value)}
            disabled={isPending}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TONE_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingItemTab>

        {/* Chat Tone */}
        <SettingItemTab
          title={t('chat_tone_label')}
          description={t('chat_tone_description')}
        >
          <Select
            value={soul?.chat_tone ?? 'thorough'}
            onValueChange={(value) => handleUpdate('chat_tone', value)}
            disabled={isPending}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHAT_TONE_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingItemTab>

        {/* Boundaries */}
        <SettingItemTab
          layout="stacked"
          title={t('boundaries_label')}
          description={t('boundaries_description')}
        >
          <Textarea
            defaultValue={soul?.boundaries ?? ''}
            maxLength={2000}
            rows={3}
            disabled={isPending}
            className="resize-none"
            onBlur={(e) => {
              const value = e.target.value.trim();
              if (value !== (soul?.boundaries ?? '')) {
                handleUpdate('boundaries', value);
              }
            }}
          />
        </SettingItemTab>
      </SettingsSection>
    </div>
  );
}
