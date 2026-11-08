import { SatelliteBrand } from '@tuturuuu/ui/custom/satellite-brand';
import { TUTURUUU_LOGO_URL } from '@tuturuuu/ui/custom/tuturuuu-logo-urls';
import type { ComponentProps, ComponentType, ReactNode } from 'react';

type PublicLink = ComponentType<ComponentProps<'a'> & { href: string }>;
type PublicImage = ComponentType<ComponentProps<'img'> & { src: string }>;
const Anchor: PublicLink = (props) => <a {...props} />;
const Image: PublicImage = ({ alt, ...props }) => <img alt={alt} {...props} />;

export interface PublicSatelliteShellProps {
  appName: string;
  appHref: string;
  children: ReactNode;
  homeHref: string;
  navigationLabel: string;
  navigation?: ReactNode;
  footer?: ReactNode;
  /** A link only: this shell never resolves identity or mounts auth providers. */
  signIn?: { href: string; label: string };
  LinkComponent?: PublicLink;
  ImageComponent?: PublicImage;
}

/** Public rendering depends solely on props, never request identity. */
export function PublicSatelliteShell({
  appName,
  appHref,
  children,
  homeHref,
  navigationLabel,
  navigation,
  footer,
  signIn,
  LinkComponent = Anchor,
  ImageComponent = Image,
}: PublicSatelliteShellProps) {
  return (
    <div className="public-satellite-shell">
      <header className="public-satellite-header">
        <SatelliteBrand
          appName={appName}
          appHref={appHref}
          centralHref={homeHref}
          LinkComponent={LinkComponent}
          logo={
            <ImageComponent
              src={TUTURUUU_LOGO_URL}
              alt=""
              width={32}
              height={32}
            />
          }
        />
        <nav aria-label={navigationLabel}>
          {navigation}
          {signIn ? (
            <LinkComponent href={signIn.href}>{signIn.label}</LinkComponent>
          ) : null}
        </nav>
      </header>
      {children}
      {footer ? <footer>{footer}</footer> : null}
    </div>
  );
}
