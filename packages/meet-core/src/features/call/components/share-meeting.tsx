'use client';

import { ClipboardCopy, Copy, Mail, Share2 } from '@tuturuuu/icons';
import { MEETING_APP } from '@tuturuuu/meet-core/runtime';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import { type ComponentType, useId, useState } from 'react';
import { buildJoinUrl, encodeRoomCode } from '../lib/room-code';
import { MeetMailShare } from './meet-mail-share';
import { MeetingActionHint } from './meeting-action-hint';

type MailContext = {
  workspaceId: string;
  actorId: string;
  canReadWorkspace: boolean;
  canManage: boolean;
};

/** Only Meet hosts who can read the workspace directory send invites by mail. */
export function canMailInvite(mail?: MailContext): mail is MailContext {
  return MEETING_APP === 'meet' && !!mail?.canReadWorkspace && mail.canManage;
}

async function copy(text: string, done: string, failed: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.error(failed);
  }
}

function CopyField({
  label,
  value,
  action,
  onCopy,
  mono = false,
}: {
  label: string;
  value: string;
  action: { label: string; primary?: boolean };
  onCopy: () => void;
  mono?: boolean;
}) {
  const id = useId();
  return (
    <div className="grid min-w-0 gap-1.5">
      <label className="font-medium text-sm" htmlFor={id}>
        {label}
      </label>
      <div className="flex min-w-0 gap-2">
        <Input
          id={id}
          readOnly
          value={value}
          placeholder={label}
          className={mono ? 'font-mono tracking-wider' : undefined}
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button
          type="button"
          variant={action.primary ? 'default' : 'outline'}
          className="shrink-0"
          aria-label={action.label}
          onClick={onCopy}
        >
          <Copy className="size-4" />
          {action.primary && (
            <span className="hidden sm:inline">{action.label}</span>
          )}
        </Button>
      </div>
    </div>
  );
}

function ShareAction({
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex min-h-11 items-start gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
      onClick={onClick}
    >
      <Icon className="mt-0.5 size-5 shrink-0" />
      <span className="grid min-w-0 gap-0.5">
        <span className="font-medium text-sm">{label}</span>
        <span className="text-muted-foreground text-xs">{hint}</span>
      </span>
    </button>
  );
}

function ShareMeetingBody({
  meetingId,
  meetingName,
  onMail,
}: {
  meetingId: string;
  meetingName: string;
  onMail?: () => void;
}) {
  const t = useTranslations('meet.call');
  const url = buildJoinUrl(window.location.origin, meetingId);
  const code = encodeRoomCode(meetingId);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="grid min-w-0 content-start gap-4">
          <CopyField
            label={t('share.link')}
            value={url}
            action={{ label: t('share.copy_link'), primary: true }}
            onCopy={() =>
              void copy(url, t('share.link_copied'), t('share.copy_failed'))
            }
          />
          <CopyField
            label={t('meeting_code')}
            value={code}
            mono
            action={{ label: t('share.copy_code') }}
            onCopy={() =>
              void copy(code, t('share.code_copied'), t('share.copy_failed'))
            }
          />
        </div>
        {/* Scanners read dark modules on a light ground most reliably, so the
            code keeps black on white in both themes. */}
        <figure className="mx-auto grid justify-items-center gap-1.5 sm:mx-0">
          <div className="rounded-xl bg-white p-2 text-black">
            <QRCodeSVG
              value={url}
              size={136}
              level="M"
              marginSize={1}
              title={t('share.qr')}
            />
          </div>
          <figcaption className="text-muted-foreground text-xs">
            {t('share.qr')}
          </figcaption>
        </figure>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <ShareAction
          icon={ClipboardCopy}
          label={t('share.copy_invite')}
          hint={t('copy_invite_hint')}
          onClick={() =>
            void copy(
              `${meetingName}\n${url}\n${t('meeting_code')}: ${code}`,
              t('invite_copied'),
              t('connection_copy_failed')
            )
          }
        />
        {onMail && (
          <ShareAction
            icon={Mail}
            label={t('share.email')}
            hint={t('share.email_hint')}
            onClick={onMail}
          />
        )}
      </div>
    </>
  );
}

/**
 * The top bar's one Share entry. It opens the meeting link, code and QR code
 * with copy actions, the full invite text and, for Meet hosts who can read the
 * workspace directory, the mail handoff.
 */
export function ShareMeetingButton({
  meetingId,
  meetingName,
  mail,
}: {
  meetingId: string;
  meetingName: string;
  mail?: MailContext;
}) {
  const t = useTranslations('meet.call');
  const [open, setOpen] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);
  const mailAllowed = canMailInvite(mail);
  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <MeetingActionHint label={t('share.button')}>
          <DialogTrigger asChild>
            <Button
              aria-label={t('share.button')}
              className="h-8 gap-1.5 rounded-full px-2 md:px-3"
              size="sm"
              type="button"
              variant="outline"
            >
              <Share2 className="size-4" />
              <span className="hidden md:inline">{t('share.button')}</span>
            </Button>
          </DialogTrigger>
        </MeetingActionHint>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('share.title')}</DialogTitle>
            <DialogDescription>{meetingName}</DialogDescription>
          </DialogHeader>
          {open && (
            <ShareMeetingBody
              meetingId={meetingId}
              meetingName={meetingName}
              onMail={
                mailAllowed
                  ? () => {
                      setOpen(false);
                      setMailOpen(true);
                    }
                  : undefined
              }
            />
          )}
        </DialogContent>
      </Dialog>
      {mailAllowed && mailOpen && (
        <MeetMailShare
          key={`${meetingId}:${mail.actorId}:${mail.workspaceId}`}
          open={mailOpen}
          onOpenChange={setMailOpen}
          meetingId={meetingId}
          title={meetingName}
          {...mail}
        />
      )}
    </>
  );
}
