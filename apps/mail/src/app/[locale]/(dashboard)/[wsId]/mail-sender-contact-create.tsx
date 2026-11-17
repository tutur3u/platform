'use client';

import { useQuery } from '@tanstack/react-query';
import { SlidersHorizontal, UserPlus } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useMailActor } from '@/components/mail-actor-provider';
import { MailContactFields } from './mail-contact-fields';
import { MailContactMoreFieldsDialog } from './mail-contact-more-fields-dialog';
import {
  defaultContactWorkspaceId,
  senderContactName,
  splitSenderName,
} from './mail-contact-prefill';
import {
  contactCapabilityQuery,
  useContactWorkspaces,
} from './mail-contact-workspace-picker';
import { useHoldMailProfile } from './mail-profile-context';
import { useSenderContactCreate } from './use-sender-contact-create';

export type MailCreatedContact = {
  workspaceId: string;
  contactId: string;
  workspaceName: string | null;
};

/**
 * "Add to Contacts" for an unknown sender. It expands in place into a form
 * prefilled from the From header; "More fields" shows the same draft in a
 * dialog. Shown only when the default workspace allows creating contacts.
 */
export function MailSenderContactCreate({
  routeWorkspaceId,
  mailboxWorkspaceId,
  email,
  headerName,
  contactsHref,
  onCreated,
}: {
  routeWorkspaceId: string;
  mailboxWorkspaceId?: string | null;
  email: string;
  headerName: string | null;
  contactsHref: (workspaceId: string) => string;
  onCreated: (created: MailCreatedContact) => void;
}) {
  const actorId = useMailActor();
  const t = useTranslations('mail.profile_actions');
  const parts = splitSenderName(headerName, email);
  const prefill = senderContactName(parts);
  const [expanded, setExpanded] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [name, setName] = useState(prefill);
  const [chosenWorkspace, setChosenWorkspace] = useState<string | null>(null);
  const gate = useQuery(
    contactCapabilityQuery(
      actorId,
      mailboxWorkspaceId || routeWorkspaceId,
      true
    )
  );
  const workspaces = useContactWorkspaces(actorId, expanded);
  const workspaceId =
    chosenWorkspace ??
    defaultContactWorkspaceId({
      mailboxWorkspaceId,
      routeWorkspaceId,
      workspaces: workspaces.data,
    });
  const selected = useQuery(
    contactCapabilityQuery(actorId, workspaceId, expanded)
  );
  const create = useSenderContactCreate({
    actorId,
    email,
    onCreated: (createdIn, contactId) =>
      onCreated({
        workspaceId: createdIn,
        contactId,
        workspaceName:
          workspaces.data?.find(
            (workspace: { id: string; name?: string | null }) =>
              workspace.id === createdIn
          )?.name ?? null,
      }),
  });
  const { state } = create;
  const pending = state.kind === 'pending';
  const dirty = name !== prefill || chosenWorkspace !== null;
  useHoldMailProfile(expanded && (dirty || pending));

  if (!actorId || !gate.data?.canCreate) return null;
  if (!expanded)
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="rounded-full"
        onClick={() => setExpanded(true)}
      >
        <UserPlus className="size-3.5" aria-hidden="true" />
        {t('add_to_contacts')}
      </Button>
    );

  const canSubmit = Boolean(selected.data?.canCreate) && !pending;
  const submit = () => {
    if (canSubmit) void create.submit(workspaceId, name);
  };
  const submitLabel = pending
    ? t('creating')
    : state.kind === 'unknown'
      ? t('check_status')
      : t('create');
  const fields = (
    <MailContactFields
      actorId={actorId}
      email={email}
      namePlaceholder={parts.placeholder || t('name_placeholder')}
      draft={{ name, workspaceId }}
      workspaces={workspaces.data ?? []}
      mailboxWorkspaceId={mailboxWorkspaceId}
      disabled={pending || state.kind === 'unknown'}
      autoFocus
      onChange={(draft) => {
        setName(draft.name);
        if (draft.workspaceId !== workspaceId)
          setChosenWorkspace(draft.workspaceId);
      }}
    />
  );
  const status =
    state.kind === 'unknown' ? (
      <p role="status" className="text-muted-foreground text-xs">
        {t('outcome_unknown')}{' '}
        <a
          className="text-primary underline underline-offset-2"
          href={contactsHref(state.workspaceId)}
        >
          {t('review_contacts')}
        </a>
      </p>
    ) : state.kind === 'unavailable' ? (
      <p role="status" className="text-muted-foreground text-xs">
        {t('create_unavailable')}
      </p>
    ) : selected.isError ? (
      <p role="status" className="text-muted-foreground text-xs">
        {t('workspace_read_only')}
      </p>
    ) : null;

  return (
    <>
      <form
        className="space-y-3 border-t pt-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {moreOpen ? null : fields}
        {moreOpen ? null : status}
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-full"
            onClick={() => setMoreOpen(true)}
          >
            <SlidersHorizontal className="size-3.5" aria-hidden="true" />
            {t('more_fields')}
          </Button>
          <span className="flex-1" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-full"
            disabled={pending}
            onClick={() => {
              setExpanded(false);
              setName(prefill);
              setChosenWorkspace(null);
            }}
          >
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            size="sm"
            className="rounded-full"
            disabled={!canSubmit}
          >
            {submitLabel}
          </Button>
        </div>
      </form>
      <MailContactMoreFieldsDialog
        open={moreOpen}
        pending={pending}
        canSubmit={canSubmit}
        submitLabel={submitLabel}
        fields={moreOpen ? fields : null}
        status={moreOpen ? status : null}
        onOpenChange={setMoreOpen}
        onSubmit={submit}
      />
    </>
  );
}
