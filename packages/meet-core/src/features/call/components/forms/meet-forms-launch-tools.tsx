'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useId, useRef, useState } from 'react';
import { MiraAdultNotice } from '../../../live-assistant/mira-adult-notice';
import {
  draftMeetForm,
  launchMeetForm,
  type MeetFormDraft,
  type MeetFormLaunch,
  readMeetFormCatalog,
} from './meet-forms-client';
import type { MeetFormsCopy } from './meet-forms-copy';

const quickTheme = {
  presetId: 'editorial-moss',
  density: 'balanced',
  surfaceStyle: 'paper',
};

export function MeetFormsLaunchTools({
  meetingId,
  locale,
  copy,
  onLaunch,
}: {
  meetingId: string;
  locale: 'en' | 'vi';
  copy: MeetFormsCopy;
  onLaunch: (launch: MeetFormLaunch) => void;
}) {
  const [formId, setFormId] = useState('');
  const [title, setTitle] = useState('');
  const [question, setQuestion] = useState('');
  const [prompt, setPrompt] = useState('');
  const [miraDraft, setMiraDraft] = useState<MeetFormDraft>();
  const attempt = useRef<{ content: string; id: string }>(null);
  const fieldId = useId();
  const catalog = useQuery({
    queryKey: ['meet-form-catalog', meetingId],
    queryFn: ({ signal }) => readMeetFormCatalog(meetingId, signal),
    retry: false,
    gcTime: 0,
  });
  const launch = useMutation({
    mutationFn: (action: Parameters<typeof launchMeetForm>[1]) =>
      launchMeetForm(meetingId, action),
    retry: false,
    onSuccess: (next) => {
      attempt.current = null;
      setTitle('');
      setQuestion('');
      setMiraDraft(undefined);
      onLaunch(next);
    },
  });
  const draft = useMutation({
    mutationFn: () => draftMeetForm(meetingId, prompt.trim(), locale),
    retry: false,
    onSuccess: ({ definition }) => setMiraDraft(definition),
  });

  function stableRequestId(content: string) {
    if (attempt.current?.content !== content) {
      attempt.current = { content, id: crypto.randomUUID() };
    }
    return attempt.current.id;
  }

  function create(definition: MeetFormDraft) {
    launch.mutate({
      action: 'create',
      requestId: stableRequestId(JSON.stringify(definition)),
      definition,
    });
  }

  if (catalog.isPending || catalog.isError) return null;
  return (
    <div className="space-y-3 border-b pb-3">
      {catalog.data.items.length > 0 && (
        <div className="flex items-end gap-2">
          <label className="min-w-0 flex-1 space-y-1 text-sm">
            <span>{copy.existingForm}</span>
            <Select value={formId} onValueChange={setFormId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={copy.chooseForm} />
              </SelectTrigger>
              <SelectContent>
                {catalog.data.items.map((item) => (
                  <SelectItem key={item.formId} value={item.formId}>
                    {item.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <Button
            size="sm"
            disabled={!formId || launch.isPending}
            onClick={() =>
              launch.mutate({
                action: 'launch',
                formId,
                launchId: stableRequestId(formId),
              })
            }
          >
            {copy.launch}
          </Button>
        </div>
      )}
      <details className="rounded-md border px-3 py-2 text-sm">
        <summary className="cursor-pointer font-medium">{copy.create}</summary>
        <div className="space-y-3 pt-3">
          <div className="space-y-1">
            <label htmlFor={`${fieldId}-title`}>{copy.formTitle}</label>
            <Input
              id={`${fieldId}-title`}
              value={title}
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`${fieldId}-question`}>{copy.firstQuestion}</label>
            <Input
              id={`${fieldId}-question`}
              value={question}
              maxLength={120}
              onChange={(event) => setQuestion(event.target.value)}
            />
          </div>
          <Button
            size="sm"
            disabled={!title.trim() || !question.trim() || launch.isPending}
            onClick={() =>
              create({
                title: title.trim(),
                theme: quickTheme,
                settings: {},
                sections: [
                  {
                    questions: [{ title: question.trim(), type: 'short_text' }],
                  },
                ],
              })
            }
          >
            {copy.launch}
          </Button>
          <div className="space-y-2 border-t pt-3">
            <label htmlFor={`${fieldId}-prompt`}>{copy.draftPrompt}</label>
            <Textarea
              id={`${fieldId}-prompt`}
              value={prompt}
              maxLength={600}
              onChange={(event) => setPrompt(event.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!prompt.trim() || draft.isPending}
              aria-describedby={`${fieldId}-draft-adults`}
              onClick={() => draft.mutate()}
            >
              {copy.draft}
              <MiraAdultNotice
                variant="compact"
                id={`${fieldId}-draft-adults`}
              />
            </Button>
            {miraDraft && (
              <div className="space-y-2 rounded-md bg-muted p-3">
                <p className="font-medium">{miraDraft.title}</p>
                <ol className="list-inside list-decimal">
                  {miraDraft.sections.flatMap((section) =>
                    section.questions.map((item, index) => (
                      <li key={`${index}-${item.title}`}>{item.title}</li>
                    ))
                  )}
                </ol>
                <Button
                  size="sm"
                  disabled={launch.isPending}
                  onClick={() => create(miraDraft)}
                >
                  {copy.launchDraft}
                </Button>
              </div>
            )}
          </div>
        </div>
      </details>
      {(launch.isError || draft.isError) && (
        <p role="alert" className="text-destructive text-sm">
          {copy.authorError}
        </p>
      )}
    </div>
  );
}
