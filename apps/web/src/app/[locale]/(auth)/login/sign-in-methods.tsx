'use client';

import {
  ChevronDownIcon,
  Fingerprint,
  History,
  Mail,
} from '@tuturuuu/icons/lucide-static';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import {
  arrangeLoginMethods,
  type LoginMethod,
  useLastLoginMethod,
} from './last-login-method';
import { SocialImageLogo, SocialLogoMask } from './login-form-parts';
import { SocialLoginButton } from './social-login-button';

const METHOD_LABEL_KEYS = {
  apple: 'login.continue_with_apple',
  azure: 'login.staff_microsoft',
  email: 'login.continue_with_email',
  github: 'login.continue_with_github',
  google: 'login.continue_with_google',
  passkey: 'login.continue_with_passkey',
} as const satisfies Record<LoginMethod, string>;

function MethodIcon({ method }: { method: LoginMethod }): ReactNode {
  switch (method) {
    case 'google':
      return <SocialImageLogo src="/media/logos/google.svg" alt="Google" />;
    case 'azure':
      return (
        <SocialImageLogo src="/media/logos/microsoft.svg" alt="Microsoft" />
      );
    case 'apple':
      return <SocialLogoMask src="/media/logos/apple.svg" alt="Apple" />;
    case 'github':
      return <SocialLogoMask src="/media/logos/github.svg" alt="GitHub" />;
    case 'email':
      return <Mail aria-hidden className="size-5" />;
    case 'passkey':
      return <Fingerprint aria-hidden className="size-5" />;
  }
}

/**
 * The first sign-in step: one decision among a few methods, with the
 * last-used method first and the rest behind "More sign-in options".
 * Choosing email or passkey opens the email step, which holds the security
 * check both of them need.
 */
export function SignInMethods({
  autoFocusFirst = false,
  disabled,
  onChoose,
}: {
  /** Focuses the first method when returning from the email step. */
  autoFocusFirst?: boolean;
  disabled: boolean;
  onChoose: (method: LoginMethod) => void;
}) {
  const t = useTranslations();
  const lastUsed = useLastLoginMethod();
  const { more, primary } = arrangeLoginMethods(lastUsed);
  const [moreOpen, setMoreOpen] = useState(false);
  // The chosen method shows a spinner in its icon lane while the page waits
  // for its provider, so a tap never leaves only greyed-out buttons.
  const [chosen, setChosen] = useState<LoginMethod | null>(null);
  // Re-enabled buttons (an OAuth start failed) forget the earlier choice.
  if (!disabled && chosen !== null) setChosen(null);

  const renderMethod = (
    method: LoginMethod,
    { autoFocus = false, withNote = true } = {}
  ) => (
    <div className="space-y-2" key={method}>
      <SocialLoginButton
        autoFocus={autoFocus}
        // The last-used mark is a border tint and an edge icon, so the
        // centred label never moves when it appears after hydration.
        className={method === lastUsed ? 'border-primary/50' : undefined}
        disabled={disabled}
        icon={
          disabled && chosen === method ? (
            <span aria-hidden className="flex">
              <LoadingIndicator className="size-5" />
            </span>
          ) : (
            <MethodIcon method={method} />
          )
        }
        onClick={() => {
          setChosen(method);
          onChoose(method);
        }}
      >
        {t(METHOD_LABEL_KEYS[method])}
        {method === lastUsed ? (
          <>
            <span className="sr-only">, {t('login.last_used')}</span>
            <History
              aria-hidden
              className="absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted-foreground"
            />
          </>
        ) : null}
      </SocialLoginButton>
      {withNote && method === 'azure' ? (
        <p className="text-muted-foreground text-sm">
          {t('login.microsoft_email_recovery')}
        </p>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Slots are keyed by position: a method remembered on this device
          fills a slot in place after hydration instead of moving rows. */}
      {primary.map((method, index) => (
        <div data-slot-index={index} key={`slot-${index.toString()}`}>
          {renderMethod(method, {
            autoFocus: autoFocusFirst && index === 0,
            withNote: false,
          })}
        </div>
      ))}
      <Collapsible onOpenChange={setMoreOpen} open={moreOpen}>
        <CollapsibleTrigger
          className="mx-auto flex items-center gap-1 rounded-full px-3 py-2 text-muted-foreground text-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          disabled={disabled}
        >
          {t('login.more_sign_in_options')}
          <ChevronDownIcon
            aria-hidden
            className={`size-4 transition-transform ${moreOpen ? 'rotate-180' : ''}`}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-1">
          {more.map((method) => renderMethod(method))}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

/** Every OAuth provider, for recovery hints such as a rate-limited email. */
export function OAuthMethodButtons({
  disabled,
  onChoose,
}: {
  disabled: boolean;
  onChoose: (method: LoginMethod) => void;
}) {
  const t = useTranslations();

  return (
    <div className="space-y-3">
      {(['google', 'azure', 'apple', 'github'] as const).map((method) => (
        <div className="space-y-2" key={method}>
          <SocialLoginButton
            disabled={disabled}
            icon={<MethodIcon method={method} />}
            onClick={() => onChoose(method)}
          >
            {t(METHOD_LABEL_KEYS[method])}
          </SocialLoginButton>
          {method === 'azure' ? (
            <p className="text-muted-foreground text-sm">
              {t('login.microsoft_email_recovery')}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
