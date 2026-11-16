'use client';

import { cn } from '@tuturuuu/utils/format';
import { useEffect, useId, useRef, useState } from 'react';
import { ROADMAP_URL, SIGN_IN_URL } from '@/lib/showcase/catalog';
import { CloseIcon, MenuIcon } from './icons';
import { AppLink } from './app-link';
import { focusRing } from './styles';

const NAV_LINKS = [
  { label: 'Demos', href: '/#demos', external: false },
  { label: 'All products', href: '/#products', external: false },
  { label: 'Roadmap', href: ROADMAP_URL, external: true },
] as const;

const navLink = cn(
  'rounded-md px-3 py-2 font-medium text-muted-foreground text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
  focusRing
);

const signInLink = cn(
  'inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 font-medium text-primary-foreground text-sm transition-colors hover:bg-primary/90',
  focusRing
);

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return NAV_LINKS.map((item) =>
    item.external ? (
      <a
        key={item.label}
        className={navLink}
        href={item.href}
        onClick={onNavigate}
      >
        {item.label}
      </a>
    ) : (
      <AppLink
        key={item.label}
        className={navLink}
        href={item.href}
        onClick={onNavigate}
      >
        {item.label}
      </AppLink>
    )
  );
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-border border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 md:px-6">
        <AppLink
          className={cn('rounded-md font-semibold tracking-tight', focusRing)}
          href="/"
          onClick={() => setOpen(false)}
        >
          Tuturuuu <span className="text-muted-foreground">Playground</span>
        </AppLink>

        <nav
          aria-label="Main"
          className="ml-auto hidden items-center gap-1 md:flex"
        >
          <NavItems />
        </nav>

        <a
          className={cn(signInLink, 'ml-auto hidden md:ml-2 md:inline-flex')}
          href={SIGN_IN_URL}
        >
          Sign in
        </a>

        <button
          ref={toggleRef}
          aria-controls={menuId}
          aria-expanded={open}
          className={cn(
            'ml-auto inline-flex size-9 items-center justify-center rounded-md border border-border text-foreground md:hidden',
            focusRing
          )}
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          {open ? <CloseIcon /> : <MenuIcon />}
          <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
        </button>
      </div>

      <div
        className={cn('border-border border-t md:hidden', !open && 'hidden')}
        id={menuId}
      >
        <nav
          aria-label="Main"
          className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3"
        >
          <NavItems onNavigate={() => setOpen(false)} />
          <a className={cn(signInLink, 'mt-2 w-full')} href={SIGN_IN_URL}>
            Sign in
          </a>
        </nav>
      </div>
    </header>
  );
}
