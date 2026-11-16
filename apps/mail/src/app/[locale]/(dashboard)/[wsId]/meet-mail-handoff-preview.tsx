'use client';
import { Button } from '@tuturuuu/ui/button';
import {
  handoffPlainDraft,
  HANDOFF_PREFIX,
  meetMailOrigins,
  parseMeetMailHandoff,
  type MeetMailPlainDraft,
} from '@tuturuuu/utils/meet-mail-handoff';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useMailActor } from '@/components/mail-actor-provider';
import {
  useMeetMailWorkspaceScope,
  useMeetMailDraftMemory,
} from './meet-mail-workspace-scope';
import {
  openMailTransfer,
  receiveMailTransfer,
  transferId,
} from './meet-mail-transfer';
import { MeetMailRecipientFlags } from './meet-mail-recipient-flags';
import { claimMeetMailHandoff } from './meet-mail-handoff-browser';

function readHandoff(raw: string, actorId: string, workspaceId: string) {
  try {
    return parseMeetMailHandoff(raw, {
      actorId,
      workspaceId,
      meetOrigin: meetMailOrigins().meet,
    });
  } catch {
    return null;
  }
}

export function MeetMailHandoffPreview({
  workspaceId,
  sourceKey,
  blocked,
  canImport,
  onImport,
}: {
  workspaceId: string;
  sourceKey: string;
  blocked: boolean;
  canImport: boolean;
  onImport: (draft: MeetMailPlainDraft) => void;
}) {
  workspaceId = useMeetMailWorkspaceScope(workspaceId);
  const actorId = useMailActor();
  const t = useTranslations('mail.meet_handoff');
  const { raw, setRaw } = useMeetMailDraftMemory();
  const transfers = useRef(new Set<() => void>());
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const close of transfers.current) close();
      transfers.current.clear();
    };
  }, []);
  const live = useRef({ actorId, workspaceId, sourceKey, blocked, canImport });
  live.current = { actorId, workspaceId, sourceKey, blocked, canImport };
  useEffect(() => {
    const removeHash = () =>
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname + window.location.search
      );
    const accept = (fragment: string) => {
      if (!actorId || !readHandoff(fragment, actorId, workspaceId)) {
        setFailed(true);
        return;
      }
      setRaw(fragment);
    };
    const capture = () => {
      const fragment = window.location.hash;
      const channel = transferId(fragment);
      if (channel) {
        removeHash();
        try {
          for (const close of transfers.current) close();
          transfers.current.clear();
          transfers.current.add(receiveMailTransfer(channel, accept));
        } catch {
          setFailed(true);
        }
        return;
      }
      if (!fragment.startsWith(HANDOFF_PREFIX)) return;
      removeHash();
      accept(fragment);
    };
    capture();
    window.addEventListener('hashchange', capture);
    return () => window.removeEventListener('hashchange', capture);
  }, [actorId, workspaceId, setRaw]);
  const clear = () => {
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname + window.location.search
    );
    setRaw(null);
  };
  if (!raw || !actorId)
    return failed ? <p role="alert">{t('invalid')}</p> : null;
  const value = readHandoff(raw, actorId, workspaceId);
  if (!value) return <p role="alert">{t('invalid')}</p>;
  return (
    <section
      className="space-y-2 rounded-lg border p-3"
      aria-label={t('title')}
    >
      <h2 className="font-medium">{t('title')}</h2>
      <p role="note" className="font-medium">
        {t('link_warning')}
      </p>
      <MeetMailRecipientFlags
        actorId={actorId}
        workspaceId={workspaceId}
        id={value.id}
        recipients={value.to}
      />
      <p>{value.subject}</p>
      <pre className="whitespace-pre-wrap font-sans text-sm">{value.body}</pre>
      <p className="text-muted-foreground text-sm">
        {t(blocked ? 'blocked' : 'confirm')}
      </p>
      {failed && <p role="alert">{t('invalid')}</p>}
      <Button
        disabled={busy || blocked || !canImport}
        onClick={async () => {
          const scope = live.current;
          setBusy(true);
          try {
            if (
              !(await claimMeetMailHandoff(value)) ||
              !mounted.current ||
              live.current.actorId !== scope.actorId ||
              live.current.workspaceId !== scope.workspaceId ||
              live.current.sourceKey !== scope.sourceKey ||
              live.current.blocked ||
              !live.current.canImport
            ) {
              setFailed(true);
              return;
            }
            clear();
            onImport(handoffPlainDraft(value));
          } catch {
            setFailed(true);
          } finally {
            setBusy(false);
          }
        }}
      >
        {t('import')}
      </Button>
      {blocked && (
        <Button
          variant="outline"
          onClick={() => {
            try {
              const target = new URL(
                `/${document.documentElement.lang === 'vi' ? 'vi' : 'en'}/${encodeURIComponent(workspaceId)}/inbox`,
                meetMailOrigins().mail
              );
              for (const close of transfers.current) close();
              transfers.current.clear();
              transfers.current.add(openMailTransfer(target, raw, value));
            } catch {
              setFailed(true);
            }
          }}
        >
          {t('new_tab')}
        </Button>
      )}
      <Button variant="ghost" onClick={clear}>
        {t('dismiss')}
      </Button>
    </section>
  );
}
