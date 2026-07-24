'use client';

import { ArrowLeft, ArrowRight } from '@tuturuuu/icons/lucide-static';
import { Button } from '@tuturuuu/ui/button';
import { Separator } from '@tuturuuu/ui/separator';
import Link from 'next/link';

export function PrevNextPager({
  previous,
  next,
}: {
  previous?: { href: string; label: string; title: string };
  next?: { href: string; label: string; title: string };
}) {
  if (!previous && !next) return null;

  return (
    <>
      <Separator className="my-8" />
      <nav className="grid gap-3 sm:grid-cols-2">
        {previous ? (
          <Button
            asChild
            className="h-auto justify-start p-4"
            variant="outline"
          >
            <Link href={previous.href}>
              <ArrowLeft className="size-4" />
              <span className="grid text-left">
                <span className="text-muted-foreground text-xs">
                  {previous.label}
                </span>
                <span>{previous.title}</span>
              </span>
            </Link>
          </Button>
        ) : (
          <span />
        )}
        {next ? (
          <Button asChild className="h-auto justify-end p-4" variant="outline">
            <Link href={next.href}>
              <span className="grid text-right">
                <span className="text-muted-foreground text-xs">
                  {next.label}
                </span>
                <span>{next.title}</span>
              </span>
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        ) : null}
      </nav>
    </>
  );
}
