'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Loader2, Plus, Tag, Trash2 } from '@tuturuuu/icons';
import {
  createMailLabel,
  deleteMailLabel,
  getMailboxOrganization,
  type MailLabel,
  type SuggestedMailLabel,
  suggestMailLabels,
  updateMailLabel,
} from '@tuturuuu/internal-api';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Switch } from '@tuturuuu/ui/switch';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const fieldClass =
  'outline-none focus-visible:ring-0 focus-visible:outline-none';

export function MailLabelSettings({
  canManage,
  mailboxId,
  workspaceId,
}: {
  canManage: boolean;
  mailboxId: string;
  workspaceId: string;
}) {
  const t = useTranslations('mail');
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#737373');
  const [suggestionPrompt, setSuggestionPrompt] = useState('');
  const [suggestions, setSuggestions] = useState<SuggestedMailLabel[]>([]);
  const organization = useQuery({
    queryFn: () => getMailboxOrganization(workspaceId, mailboxId),
    queryKey: ['mail', workspaceId, mailboxId, 'organization'],
  });
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ['mail', workspaceId, mailboxId, 'organization'],
    });
  const createMutation = useMutation({
    mutationFn: (payload: {
      aiEnabled?: boolean;
      aiInstructions?: string;
      color?: string;
      description?: string;
      name: string;
    }) => createMailLabel(workspaceId, mailboxId, payload),
    onSuccess: async () => {
      setName('');
      setDescription('');
      setColor('#737373');
      await invalidate();
    },
  });
  const suggestMutation = useMutation({
    mutationFn: () =>
      suggestMailLabels(workspaceId, mailboxId, {
        action: 'suggest_labels',
        instructions: suggestionPrompt,
      }),
    onSuccess: (result) => setSuggestions(result.suggestions),
  });
  const customLabels = (organization.data?.labels ?? []).filter(
    (label) => label.kind === 'custom'
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-semibold text-lg">{t('label_management')}</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          {t('label_management_description')}
        </p>
      </div>

      {canManage ? (
        <div className="grid gap-3 border-dynamic border-y py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_3rem_auto]">
          <Input
            className={fieldClass}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('label_name')}
            value={name}
          />
          <Input
            className={fieldClass}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t('label_description_placeholder')}
            value={description}
          />
          <Input
            aria-label={t('label_color')}
            className="h-9 cursor-pointer border-0 p-1 outline-none focus-visible:outline-none focus-visible:ring-0"
            onChange={(event) => setColor(event.target.value)}
            type="color"
            value={color}
          />
          <Button
            disabled={!name.trim() || createMutation.isPending}
            onClick={() =>
              createMutation.mutate({ color, description, name: name.trim() })
            }
          >
            <Plus className="size-4" /> {t('create_label')}
          </Button>
        </div>
      ) : null}

      {organization.isLoading ? (
        <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
          <Loader2 className="size-4 animate-spin" /> {t('loading')}
        </div>
      ) : customLabels.length ? (
        <Accordion className="divide-y divide-dynamic" type="multiple">
          {customLabels.map((label) => (
            <LabelEditor
              canManage={canManage}
              key={label.id}
              label={label}
              mailboxId={mailboxId}
              onChanged={invalidate}
              workspaceId={workspaceId}
            />
          ))}
        </Accordion>
      ) : (
        <div className="flex flex-col items-start gap-2 border-dynamic border-y py-8">
          <Tag className="size-5 text-muted-foreground" />
          <div className="font-medium text-sm">{t('no_custom_labels')}</div>
          <p className="text-muted-foreground text-sm">
            {t('no_custom_labels_description')}
          </p>
        </div>
      )}

      {canManage ? (
        <div className="space-y-3 border-dynamic border-t pt-5">
          <div className="flex items-center gap-2">
            <Bot className="size-4" />
            <h3 className="font-semibold text-sm">
              {t('ai_label_suggestions')}
            </h3>
          </div>
          <Textarea
            className={`${fieldClass} min-h-20 resize-y`}
            onChange={(event) => setSuggestionPrompt(event.target.value)}
            placeholder={t('ai_label_suggestions_placeholder')}
            value={suggestionPrompt}
          />
          <Button
            disabled={suggestMutation.isPending}
            onClick={() => suggestMutation.mutate()}
            variant="outline"
          >
            {suggestMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Bot className="size-4" />
            )}
            {t('suggest_labels')}
          </Button>
          {suggestions.length ? (
            <div className="divide-y divide-dynamic border-dynamic border-y">
              {suggestions.map((suggestion) => (
                <div
                  className="flex items-start gap-3 py-3"
                  key={`${suggestion.name}-${suggestion.description}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm">{suggestion.name}</div>
                    <p className="mt-1 text-muted-foreground text-xs">
                      {suggestion.description}
                    </p>
                  </div>
                  <Button
                    onClick={() =>
                      createMutation.mutate({
                        aiEnabled: true,
                        aiInstructions: suggestion.aiInstructions,
                        description: suggestion.description,
                        name: suggestion.name,
                      })
                    }
                    size="sm"
                    variant="ghost"
                  >
                    <Plus className="size-4" /> {t('add')}
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function LabelEditor({
  canManage,
  label,
  mailboxId,
  onChanged,
  workspaceId,
}: {
  canManage: boolean;
  label: MailLabel;
  mailboxId: string;
  onChanged: () => Promise<unknown>;
  workspaceId: string;
}) {
  const t = useTranslations('mail');
  const [name, setName] = useState(label.name);
  const [description, setDescription] = useState(label.description);
  const [color, setColor] = useState(label.color ?? '#737373');
  const [aiEnabled, setAiEnabled] = useState(label.aiEnabled);
  const [aiAutoApply, setAiAutoApply] = useState(label.aiAutoApply);
  const [aiInstructions, setAiInstructions] = useState(label.aiInstructions);
  const save = useMutation({
    mutationFn: () =>
      updateMailLabel(workspaceId, mailboxId, label.id, {
        aiAutoApply,
        aiEnabled,
        aiInstructions,
        color,
        description,
        name,
      }),
    onSuccess: onChanged,
  });
  const remove = useMutation({
    mutationFn: () => deleteMailLabel(workspaceId, mailboxId, label.id),
    onSuccess: onChanged,
  });
  const dirty =
    name !== label.name ||
    description !== label.description ||
    color !== (label.color ?? '#737373') ||
    aiEnabled !== label.aiEnabled ||
    aiAutoApply !== label.aiAutoApply ||
    aiInstructions !== label.aiInstructions;

  return (
    <AccordionItem className="border-0" value={label.id}>
      <AccordionTrigger className="py-3 hover:no-underline">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span
            className="size-2.5 shrink-0 rounded-full bg-foreground/30"
            style={label.color ? { backgroundColor: label.color } : undefined}
          />
          <span className="truncate font-medium text-sm">{label.name}</span>
          {label.aiEnabled ? (
            <span className="rounded-md bg-foreground/[0.06] px-1.5 py-0.5 text-[0.68rem] text-muted-foreground">
              {t('smart')}
            </span>
          ) : null}
        </div>
      </AccordionTrigger>
      <AccordionContent className="space-y-4 pb-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_3rem]">
          <Input
            className={fieldClass}
            disabled={!canManage}
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
          <Input
            className={fieldClass}
            disabled={!canManage}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t('label_description_placeholder')}
            value={description}
          />
          <Input
            aria-label={t('label_color')}
            className="h-9 cursor-pointer border-0 p-1 outline-none focus-visible:outline-none focus-visible:ring-0"
            disabled={!canManage}
            onChange={(event) => setColor(event.target.value)}
            type="color"
            value={color}
          />
        </div>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="font-medium text-sm">{t('smart_label')}</div>
            <p className="mt-1 text-muted-foreground text-xs">
              {t('smart_label_description')}
            </p>
          </div>
          <Switch
            checked={aiEnabled}
            disabled={!canManage}
            onCheckedChange={(enabled) => {
              setAiEnabled(enabled);
              if (!enabled) setAiAutoApply(false);
            }}
          />
        </div>
        {aiEnabled ? (
          <>
            <Textarea
              className={`${fieldClass} min-h-24 resize-y`}
              disabled={!canManage}
              onChange={(event) => setAiInstructions(event.target.value)}
              placeholder={t('smart_label_instructions_placeholder')}
              value={aiInstructions}
            />
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm">
                  {t('auto_apply_label')}
                </div>
                <p className="mt-1 text-muted-foreground text-xs">
                  {t('auto_apply_label_description')}
                </p>
              </div>
              <Switch
                checked={aiAutoApply}
                disabled={!canManage}
                onCheckedChange={setAiAutoApply}
              />
            </div>
          </>
        ) : null}
        {canManage ? (
          <div className="flex items-center justify-between">
            <Button
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
              size="sm"
              variant="ghost"
            >
              <Trash2 className="size-4" /> {t('delete')}
            </Button>
            <Button
              disabled={!dirty || save.isPending || !name.trim()}
              onClick={() => save.mutate()}
              size="sm"
            >
              {t('save')}
            </Button>
          </div>
        ) : null}
      </AccordionContent>
    </AccordionItem>
  );
}
