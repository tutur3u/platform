import { cn } from '@tuturuuu/utils/format';
import Image from 'next/image';
import Link from 'next/link';
import { ReactNode, Suspense } from 'react';

export interface NavbarProps {
  /**
   * Logo component or image source
   */
  logo?: string | ReactNode;

  /**
   * Title component or text
   */
  title?: ReactNode;

  /**
   * Element to display after the logo/title section (e.g., workspace selector)
   */
  afterTitle?: ReactNode;

  /**
   * Main navigation menu component
   */
  navigationMenu?: ReactNode;

  /**
   * Right-side actions/components
   */
  actions?: ReactNode;

  /**
   * Optional separator component to display below the navbar
   */
  separator?: ReactNode;

  /**
   * URL to navigate to when clicking on the logo
   */
  homeUrl?: string;

  /**
   * Whether to hide the navbar on desktop screens
   */
  onlyOnMobile?: boolean;

  /**
   * Additional CSS classes for the navbar
   */
  className?: string;

  /**
   * Additional CSS classes for the navbar content
   */
  contentClassName?: string;

  /**
   * Additional CSS classes for the logo
   */
  logoClassName?: string;
}

export function Navbar({
  logo,
  title,
  afterTitle,
  navigationMenu,
  actions,
  separator,
  homeUrl = '/',
  onlyOnMobile = false,
  className,
  contentClassName,
  logoClassName,
}: NavbarProps) {
  return (
    <nav
      id="navbar"
      className={cn(
        'fixed inset-x-0 top-0 z-50',
        onlyOnMobile && 'md:hidden',
        className
      )}
    >
      <div
        id="navbar-content"
        className={cn(
          'bg-transparent px-4 py-2 font-semibold md:px-8 lg:px-16 xl:px-32',
          contentClassName
        )}
      >
        <div className="relative flex items-center justify-between gap-2 md:gap-4">
          <div className="flex w-full items-center gap-2">
            <Link
              href={homeUrl}
              className={cn('flex flex-none items-center gap-2', logoClassName)}
            >
              {typeof logo === 'string' ? (
                <Image
                  src={logo}
                  className="h-8 w-8"
                  width={32}
                  height={32}
                  alt="logo"
                />
              ) : (
                logo
              )}
              {title}
            </Link>

            {afterTitle && (
              <Suspense
                fallback={
                  <div className="h-10 w-32 animate-pulse rounded-lg bg-foreground/5" />
                }
              >
                {afterTitle}
              </Suspense>
            )}

            {navigationMenu && (
              <div className="ml-4 hidden w-full md:block">
                {navigationMenu}
              </div>
            )}
          </div>

          {actions && (
            <div className="flex w-fit flex-none flex-row-reverse items-center gap-2 md:flex-row md:justify-between">
              {actions}
            </div>
          )}
        </div>
      </div>
      {separator}
    </nav>
  );
}
