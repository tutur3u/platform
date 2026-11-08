'use client';

import { Sparkles } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
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
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import {
  useMiraSoul,
  useUpdateMiraSoul,
} from '../../../app/[locale]/(dashboard)/[wsId]/(dashboard)/hooks/use-mira-soul';

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

type PersonaTemplate = {
  key: string;
  name: string;
  tone: string;
  personality: string;
  vibe: string;
  chat_tone: string;
};

const PERSONA_TEMPLATES: PersonaTemplate[] = [
  {
    key: 'default',
    name: 'Mira',
    tone: 'balanced',
    personality: 'Helpful and knowledgeable',
    vibe: 'warm',
    chat_tone: 'thorough',
  },
  {
    key: 'casual',
    name: 'Mira',
    tone: 'casual',
    personality: 'Laid-back friend who keeps it real',
    vibe: 'energetic',
    chat_tone: 'concise',
  },
  {
    key: 'coach',
    name: 'Mira',
    tone: 'professional',
    personality: 'Disciplined coach focused on accountability',
    vibe: 'calm',
    chat_tone: 'brief',
  },
  {
    key: 'creative',
    name: 'Mira',
    tone: 'playful',
    personality: 'Imaginative collaborator who loves brainstorming',
    vibe: 'witty',
    chat_tone: 'detailed',
  },
];

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
    (template: PersonaTemplate) => {
      updateSoul({
        name: template.name,
        tone: template.tone,
        personality: template.personality,
        vibe: template.vibe,
        chat_tone: template.chat_tone,
      });
    },
    [updateSoul]
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
      {/* Persona Templates */}
      <SettingsSection>
        <SettingItemTab
          layout="stacked"
          title={t('persona_templates')}
          description={t('persona_templates_description')}
          icon={<Sparkles className="h-4 w-4" />}
        >
          <div className="grid @md:grid-cols-2 gap-2">
            {PERSONA_TEMPLATES.map((template) => (
              <Button
                key={template.key}
                variant="outline"
                size="sm"
                className="h-auto justify-start whitespace-normal px-3 py-2 text-left"
                disabled={isPending}
                onClick={() => handleApplyTemplate(template)}
              >
                <div>
                  <div className="font-medium text-sm">
                    {t(`template_${template.key}` as Parameters<typeof t>[0])}
                  </div>
                  <div className="mt-0.5 font-normal text-muted-foreground text-sm">
                    {template.personality}
                  </div>
                </div>
              </Button>
            ))}
          </div>
        </SettingItemTab>
      </SettingsSection>

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
