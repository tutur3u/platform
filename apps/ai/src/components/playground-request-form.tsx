'use client';

import { SlidersHorizontal } from '@tuturuuu/icons';
import type {
  AiStudioPlaygroundEndpoint,
  AiStudioPlaygroundTool,
  AiStudioPublicModel,
} from '@tuturuuu/internal-api/ai-studio';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { SectionCard } from './studio/section-card';

export const PLAYGROUND_TOOLS: AiStudioPlaygroundTool[] = [
  'calculator',
  'current_time',
];

export function PlaygroundRequestForm({
  enabledTools,
  endpoint,
  maxOutputTokens,
  maxSteps,
  model,
  models,
  onEndpointChange,
  onMaxOutputTokensChange,
  onMaxStepsChange,
  onModelChange,
  onToggleTool,
}: {
  enabledTools: AiStudioPlaygroundTool[];
  endpoint: AiStudioPlaygroundEndpoint;
  maxOutputTokens: number;
  maxSteps: number;
  model: string;
  models: AiStudioPublicModel[];
  onEndpointChange: (value: AiStudioPlaygroundEndpoint) => void;
  onMaxOutputTokensChange: (value: number) => void;
  onMaxStepsChange: (value: number) => void;
  onModelChange: (value: string) => void;
  onToggleTool: (tool: AiStudioPlaygroundTool) => void;
}) {
  const t = useTranslations('ai-studio.playground_console');

  return (
    <SectionCard icon={SlidersHorizontal} title={t('request_title')}>
      <div className="space-y-4">
        <Field label={t('endpoint')}>
          <Select
            onValueChange={(value) =>
              onEndpointChange(value as AiStudioPlaygroundEndpoint)
            }
            value={endpoint}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="responses">POST /v1/responses</SelectItem>
              <SelectItem value="chat">POST /v1/chat/completions</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label={t('model')}>
          {models.length ? (
            <Select onValueChange={onModelChange} value={model}>
              <SelectTrigger>
                <SelectValue placeholder={t('select_model')} />
              </SelectTrigger>
              <SelectContent>
                {models.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} · {item.ownedBy}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              onChange={(event) => onModelChange(event.target.value)}
              placeholder={t('model_placeholder')}
              value={model}
            />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('max_tokens')}>
            <Input
              max={32_768}
              min={1}
              onChange={(event) =>
                onMaxOutputTokensChange(Number(event.target.value))
              }
              type="number"
              value={maxOutputTokens}
            />
          </Field>
          <Field label={t('max_steps')}>
            <Input
              max={8}
              min={1}
              onChange={(event) => onMaxStepsChange(Number(event.target.value))}
              type="number"
              value={maxSteps}
            />
          </Field>
        </div>
        <Field label={t('tools')}>
          <div className="flex flex-wrap gap-2">
            {PLAYGROUND_TOOLS.map((name) => {
              const active = enabledTools.includes(name);
              return (
                <Button
                  aria-pressed={active}
                  key={name}
                  onClick={() => onToggleTool(name)}
                  size="sm"
                  type="button"
                  variant={active ? 'secondary' : 'outline'}
                >
                  {t(`tool_${name}`)}
                </Button>
              );
            })}
          </div>
        </Field>
      </div>
    </SectionCard>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
