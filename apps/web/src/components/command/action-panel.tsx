'use client';

import { ArrowLeft, ExternalLink } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Command, CommandList } from '@tuturuuu/ui/command';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { AddTaskForm } from './add-task-form';
import { QuickTimeTracker } from './quick-time-tracker';
import type { CommandAction } from './utils/command-actions';

interface CommandActionPanelProps {
  action: CommandAction;
  wsId: string;
  onBack: () => void;
  onClose: () => void;
}

function ActionPanelHeader({
  action,
  onBack,
}: {
  action: CommandAction;
  onBack: () => void;
}) {
  const t = useTranslations('command_palette');

  return (
    <div className="flex items-center gap-3 border-b px-4 py-3">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onBack}
        className="h-8 w-8 shrink-0"
        aria-label={t('back')}
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <div className="flex min-w-0 flex-1 flex-col">
        <h2 className="truncate font-semibold text-lg">{action.title}</h2>
        <p className="truncate text-muted-foreground text-sm">
          {action.description}
        </p>
      </div>
    </div>
  );
}

function GenericActionForm({
  action,
  onClose,
}: {
  action: CommandAction;
  onClose: () => void;
}) {
  const router = useRouter();
  const t = useTranslations('command_palette');
  const [name, setName] = React.useState('');
  const [notes, setNotes] = React.useState('');

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const target = new URL(action.targetHref, window.location.origin);
    const trimmedName = name.trim();
    const trimmedNotes = notes.trim();

    if (trimmedName) {
      target.searchParams.set('commandName', trimmedName);
    }

    if (trimmedNotes) {
      target.searchParams.set('commandNotes', trimmedNotes);
    }

    router.push(`${target.pathname}${target.search}${target.hash}`);
    onClose();
  };

  const handleOpenDestination = () => {
    router.push(action.targetHref);
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4">
      <div className="rounded-md border bg-muted/30 p-3 text-muted-foreground text-sm">
        {t('inline_action_description', { product: action.productTitle })}
      </div>

      <div className="space-y-2">
        <Label htmlFor="command-action-name">
          {t('generic_action_name_label')}
        </Label>
        <Input
          id="command-action-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('generic_action_name_placeholder', {
            product: action.productTitle,
          })}
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="command-action-notes">
          {t('generic_action_notes_label')}
        </Label>
        <Textarea
          id="command-action-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder={t('generic_action_notes_placeholder')}
          className="min-h-24"
        />
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={handleOpenDestination}>
          <ExternalLink className="h-4 w-4" />
          {t('open_destination')}
        </Button>
        <Button type="submit">{t('continue')}</Button>
      </div>
    </form>
  );
}

export function CommandActionPanel({
  action,
  wsId,
  onBack,
  onClose,
}: CommandActionPanelProps) {
  return (
    <div className="flex h-[70vh] min-h-125 flex-col">
      <ActionPanelHeader action={action} onBack={onBack} />
      <div className="min-h-0 flex-1 overflow-auto">
        {action.panel === 'task-create' ? (
          <AddTaskForm
            wsId={wsId}
            setOpen={(open) => {
              if (!open) onClose();
            }}
            setIsLoading={() => {}}
          />
        ) : action.panel === 'time-tracker' ? (
          <Command className="rounded-none border-none" shouldFilter={false}>
            <CommandList className="max-h-none">
              <QuickTimeTracker
                wsId={wsId}
                setOpen={(open) => {
                  if (!open) onClose();
                }}
                setIsLoading={() => {}}
              />
            </CommandList>
          </Command>
        ) : (
          <GenericActionForm action={action} onClose={onClose} />
        )}
      </div>
    </div>
  );
}
