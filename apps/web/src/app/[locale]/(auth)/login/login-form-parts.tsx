import { Card, CardContent } from '@tuturuuu/ui/card';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { Separator } from '@tuturuuu/ui/separator';
import { ProfileLoadingState } from './internal-app-account-confirmation-parts';
import type { ReturnUrlFailureKind } from './invalid-return-url-warning';

export type AuthStage = 'identify' | 'otp' | 'password';

export interface MobileMfaApprovalChallenge {
  expiresAt: string;
  id: string;
  pairCode: string;
  secret: string;
}

export interface ReturnUrlValidationFailure {
  kind: ReturnUrlFailureKind;
  returnUrl: string;
}

export function TurnstileLoadingFallback() {
  return (
    <div
      aria-hidden="true"
      className="mx-auto h-[65px] w-[300px] max-w-full animate-pulse rounded-xl bg-muted/50"
    />
  );
}

export function InputOTPRowFallback() {
  return (
    <div className="flex w-full justify-center gap-2">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          aria-hidden="true"
          className="h-12 w-full animate-pulse rounded-2xl border border-border/60 bg-muted/50"
          key={`otp-fallback-${index + 1}`}
        />
      ))}
    </div>
  );
}

export function InternalAppAccountConfirmationFallback({
  appName,
  disabled,
  onUseAnotherAccount,
}: {
  appName: string;
  disabled: boolean;
  onUseAnotherAccount: () => void;
}) {
  return (
    <ProfileLoadingState
      appName={appName}
      disabled={disabled}
      onUseAnotherAccount={onUseAnotherAccount}
    />
  );
}

export function RedirectingAfterAuthCard({ label }: { label: string }) {
  return (
    <div>
      <Card className="overflow-hidden rounded-3xl border bg-background/95 shadow-xl">
        <CardContent className="flex flex-col items-center justify-center gap-3 p-8 text-center">
          <LoadingIndicator className="size-6" />
          <p className="font-medium text-muted-foreground text-sm">{label}</p>
        </CardContent>
      </Card>
    </div>
  );
}

export function getReturnAppName(returnApp: string | null) {
  if (returnApp === 'learn') return 'Learn';
  if (returnApp === 'tulearn') return 'Learn';
  if (returnApp === 'teach') return 'Teach';
  if (returnApp === 'chat') return 'Chat';
  if (returnApp === 'nova') return 'Nova';
  if (returnApp === 'cms') return 'CMS';
  if (returnApp === 'inventory') return 'Inventory';
  return returnApp ?? 'the app';
}

export function SocialLogoMask({ src, alt }: { src: string; alt: string }) {
  return (
    <span
      aria-label={alt}
      role="img"
      className="block size-5 shrink-0 bg-current transition-transform duration-200 group-hover:scale-110"
      style={{
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
      }}
    />
  );
}

export function SocialImageLogo({ src, alt }: { src: string; alt: string }) {
  return (
    <span
      aria-label={alt}
      role="img"
      className="block size-5 shrink-0 bg-center bg-contain bg-no-repeat transition-transform duration-200 group-hover:scale-110"
      style={{ backgroundImage: `url(${src})` }}
    />
  );
}

export function LoginMethodSeparator({ label }: { label: string }) {
  return (
    <div className="relative py-0.5">
      <Separator className="bg-border/60" />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="bg-background/95 px-3 text-muted-foreground text-xs">
          {label}
        </span>
      </div>
    </div>
  );
}
