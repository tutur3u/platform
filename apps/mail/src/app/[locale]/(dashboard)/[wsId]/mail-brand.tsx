import { FixedAppBrand } from '@tuturuuu/satellite/fixed-app-brand';

interface MailBrandProps {
  centralHref: string;
  className?: string;
  mailHref: string;
}

export function MailBrand({
  centralHref,
  className,
  mailHref,
}: MailBrandProps) {
  return (
    <FixedAppBrand
      appHref={mailHref}
      appName="Mail"
      centralHref={centralHref}
      className={className}
    />
  );
}
