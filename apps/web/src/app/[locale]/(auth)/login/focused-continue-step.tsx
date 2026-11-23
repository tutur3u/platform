'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import {
  getAvatarUrl,
  getDisplayName,
  getInitials,
} from './internal-app-account-confirmation-parts';
import { useAutoContinue } from './use-auto-continue';

export const FOCUSED_LINK_CLASS =
  'mx-auto rounded-sm px-1 font-semibold text-muted-foreground text-sm underline decoration-input underline-offset-[3px] transition-colors hover:text-foreground hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50';

/** The signed-in account as one quiet row: avatar, name and status. */
function AccountRow({
  avatarUrl,
  name,
  status,
}: {
  avatarUrl?: string | null;
  name: string;
  status: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-background/60 p-3">
      <Avatar className="size-11">
        <AvatarImage alt={name} src={getAvatarUrl(avatarUrl)} />
        <AvatarFallback className="bg-calendar-bg-pink font-extrabold text-dynamic-pink">
          {getInitials(name)}
        </AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-col">
        <p className="truncate font-bold">{name}</p>
        <p className="truncate text-muted-foreground text-sm">{status}</p>
      </div>
    </div>
  );
}

/** One live status line in place of the actions, at the same height. */
function StatusLine({ label }: { label: string }) {
  return (
    <div className="flex h-12 items-center justify-center gap-2.5 rounded-2xl bg-muted/60 px-4">
      <LoadingIndicator
        aria-hidden
        className="size-4 shrink-0 motion-reduce:animate-none"
      />
      <p
        aria-atomic="true"
        aria-live="polite"
        className="truncate font-semibold text-sm"
        role="status"
      >
        {label}
      </p>
    </div>
  );
}

/**
 * "Continue as {name}" for the session the page already has. A strict PKCE
 * app (`autoContinue`) continues on its own after a short pause with a
 * Cancel link; every other app waits for the click. While the handoff runs
 * the card says where it is going, so the redirect never shows a blank page.
 */
export function FocusedContinueStep({
  accountLink = false,
  appName,
  autoContinue,
  busy,
  canContinue,
  continuing,
  onContinue,
  onUseAnotherAccount,
  session,
}: {
  /** The handoff links this account to the app, so say so before Continue. */
  accountLink?: boolean;
  appName: string;
  autoContinue: boolean;
  busy: boolean;
  canContinue: boolean;
  continuing: boolean;
  onContinue: () => void;
  onUseAnotherAccount: () => void;
  session: { avatarUrl: string | null; name: string | null } | null;
}) {
  const t = useTranslations();
  // Cancel unmounts on press; hand focus to Continue so a keyboard user
  // lands on the next action instead of the page body.
  const focusContinueRef = useRef(false);
  const auto = useAutoContinue({
    eligible: autoContinue && canContinue && !busy,
    onContinue,
  });
  const name = getDisplayName({
    displayName: session?.name,
    fallback: t('login.unknown_account'),
  });

  return (
    <>
      <AccountRow
        avatarUrl={session?.avatarUrl}
        name={name}
        status={t('login.signed_in_on_browser')}
      />
      {accountLink && (
        <p className="text-balance text-center text-muted-foreground text-sm">
          {t('login.account_link_notice', { app: appName })}
        </p>
      )}
      <div className="flex flex-col gap-3">
        {continuing ? (
          <StatusLine label={t('login.returning_to_app', { app: appName })} />
        ) : auto.counting ? (
          <StatusLine label={t('login.signing_you_in_to', { app: appName })} />
        ) : (
          <Button
            className="h-12 w-full rounded-2xl px-6 font-bold"
            disabled={!canContinue || busy}
            onClick={onContinue}
            ref={(element) => {
              if (element && focusContinueRef.current) {
                focusContinueRef.current = false;
                element.focus();
              }
            }}
            type="button"
          >
            <span className="min-w-0 truncate">
              {t('login.continue_as', { name })}
            </span>
          </Button>
        )}
        {auto.counting && !continuing ? (
          <button
            className={FOCUSED_LINK_CLASS}
            key="cancel"
            onClick={() => {
              focusContinueRef.current = true;
              auto.cancel();
            }}
            type="button"
            {...auto.holdHandlers}
          >
            {t('login.auto_continue_cancel')}
          </button>
        ) : (
          <button
            className={FOCUSED_LINK_CLASS}
            disabled={busy}
            key="another"
            onClick={onUseAnotherAccount}
            type="button"
          >
            {t('login.use_another_account')}
          </button>
        )}
      </div>
    </>
  );
}
