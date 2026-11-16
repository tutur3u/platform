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
import { useMeetMailWorkspaceScope } from './meet-mail-workspace-scope';
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
  const [raw, setRaw] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const live = useRef({ actorId, workspaceId, sourceKey, blocked, canImport });
  live.current = { actorId, workspaceId, sourceKey, blocked, canImport };
  useEffect(() => {
    setRaw(null);
    const capture = () => {
      if (!window.location.hash.startsWith(HANDOFF_PREFIX)) return;
      const fragment = window.location.hash;
      if (!actorId) return;
      if (!readHandoff(fragment, actorId, workspaceId)) {
        window.history.replaceState(
          window.history.state,
          '',
          window.location.pathname + window.location.search
        );
        setFailed(true);
        return;
      }
      setRaw((current) => current ?? fragment);
    };
    capture();
    window.addEventListener('hashchange', capture);
    return () => window.removeEventListener('hashchange', capture);
  }, [actorId, workspaceId]);
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
      <p>{value.to.join(', ')}</p>
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
              target.hash = raw;
              window.open(target.href, '_blank', 'noopener,noreferrer');
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
