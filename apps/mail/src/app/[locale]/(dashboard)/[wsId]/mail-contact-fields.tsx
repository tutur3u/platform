'use client';

import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { MAX_NAME_LENGTH } from '@tuturuuu/utils/constants';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { MailContactWorkspacePicker } from './mail-contact-workspace-picker';

export type MailContactDraft = {
  name: string;
  workspaceId: string;
};

/** Name, read-only email and workspace for a new contact. */
export function MailContactFields({
  actorId,
  email,
  namePlaceholder,
  draft,
  workspaces,
  mailboxWorkspaceId,
  disabled,
  autoFocus,
  onChange,
}: {
  actorId: string | null;
  email: string;
  namePlaceholder: string;
  draft: MailContactDraft;
  workspaces: readonly {
    id: string;
    name: string | null;
    personal?: boolean | null;
  }[];
  mailboxWorkspaceId?: string | null;
  disabled?: boolean;
  autoFocus?: boolean;
  onChange: (draft: MailContactDraft) => void;
}) {
  const t = useTranslations('mail.profile_actions');
  const id = useId();
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-name`}>{t('name')}</Label>
        <Input
          id={`${id}-name`}
          value={draft.name}
          maxLength={MAX_NAME_LENGTH}
          placeholder={namePlaceholder}
          disabled={disabled}
          autoFocus={autoFocus}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-email`}>{t('email')}</Label>
        <Input
          id={`${id}-email`}
          value={email}
          placeholder={email}
          readOnly
          className="text-muted-foreground"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-workspace`}>{t('workspace')}</Label>
        <MailContactWorkspacePicker
          id={`${id}-workspace`}
          actorId={actorId}
          workspaces={workspaces}
          value={draft.workspaceId}
          mailboxWorkspaceId={mailboxWorkspaceId}
          open={pickerOpen}
          disabled={disabled}
          onOpenChange={setPickerOpen}
          onValueChange={(workspaceId) => onChange({ ...draft, workspaceId })}
        />
      </div>
    </div>
  );
}
