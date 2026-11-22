'use client';

import {
  ChevronDownIcon,
  Fingerprint,
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
import type { LoginMethod } from './last-login-method';
import { SocialImageLogo, SocialLogoMask } from './login-form-parts';
import { arrangeSignInMethodStack } from './sign-in-method-stack';
import { LastUsedChip, SocialLoginButton } from './social-login-button';

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

type OAuthLoginMethod = Exclude<LoginMethod, 'email' | 'passkey'>;

/**
 * The sign-in methods under the email field: the last-used method (when it
 * is not email), Google and passkey, then the rest behind "More options".
 * The passkey is rendered by the caller so it keeps the security check the
 * email field shares with it.
 */
export function SignInAlternatives({
  disabled,
  lastUsed,
  onChoose,
  renderPasskey,
}: {
  disabled: boolean;
  lastUsed: LoginMethod | null;
  onChoose: (method: OAuthLoginMethod) => void;
  renderPasskey: (badge: ReactNode) => ReactNode;
}) {
  const t = useTranslations();
  const { alternatives, more } = arrangeSignInMethodStack(lastUsed);
  const [moreOpen, setMoreOpen] = useState(false);
  // The chosen provider shows a spinner in its icon lane while the page
  // waits for it, so a tap never leaves only greyed-out buttons.
  const [chosen, setChosen] = useState<LoginMethod | null>(null);
  // Re-enabled buttons (an OAuth start failed) forget the earlier choice.
  if (!disabled && chosen !== null) setChosen(null);

  const renderMethod = (method: LoginMethod, withNote: boolean) => {
    const badge =
      method === lastUsed ? (
        <LastUsedChip label={t('login.last_used')} />
      ) : null;
    if (method === 'passkey') return renderPasskey(badge);
    if (method === 'email') return null;
    return (
      <div className="space-y-2">
        <SocialLoginButton
          badge={badge}
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
        </SocialLoginButton>
        {withNote && method === 'azure' ? (
          <p className="text-balance text-center text-muted-foreground text-sm">
            {t('login.microsoft_email_recovery')}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-2.5">
      {/* Slots are keyed by position: a method remembered on this device
          fills a slot in place after hydration instead of moving rows. */}
      {alternatives.map((method, index) => (
        <div data-slot-index={index} key={`slot-${index.toString()}`}>
          {renderMethod(method, false)}
        </div>
      ))}
      <Collapsible onOpenChange={setMoreOpen} open={moreOpen}>
        <CollapsibleTrigger
          className="mx-auto flex min-h-11 items-center gap-1 rounded-full px-3.5 font-semibold text-foreground text-sm transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
          disabled={disabled}
        >
          {t('login.more_sign_in_options')}
          <ChevronDownIcon
            aria-hidden
            className={`size-4 transition-transform motion-reduce:transition-none ${moreOpen ? 'rotate-180' : ''}`}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-2.5 pt-1">
          {more.map((method) => (
            <div key={method}>{renderMethod(method, true)}</div>
          ))}
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
            <p className="text-balance text-center text-muted-foreground text-sm">
              {t('login.microsoft_email_recovery')}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
