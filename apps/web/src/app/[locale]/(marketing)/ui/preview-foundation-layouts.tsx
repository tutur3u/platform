'use client';

import { Check, Settings } from '@tuturuuu/icons';
import { AspectRatio } from '@tuturuuu/ui/aspect-ratio';
import { Avatar, AvatarFallback } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@tuturuuu/ui/breadcrumb';
import { Button } from '@tuturuuu/ui/button';
import { Calendar } from '@tuturuuu/ui/calendar';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@tuturuuu/ui/carousel';
import type { ReactNode } from 'react';
import type { PreviewKind } from './component-registry';

type SampleTranslator = (key: string) => string;

export function renderFoundationLayoutPreview(
  kind: PreviewKind,
  s: SampleTranslator
): ReactNode | null {
  switch (kind) {
    case 'aspect-ratio':
      return (
        <AspectRatio
          className="overflow-hidden rounded-lg border bg-muted"
          ratio={16 / 9}
        >
          <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary)/0.18),transparent_35%),linear-gradient(135deg,hsl(var(--muted)),hsl(var(--background)))]">
            <div className="rounded-md border bg-background/80 px-3 py-2 font-medium text-sm">
              16:9
            </div>
          </div>
        </AspectRatio>
      );
    case 'avatar':
      return (
        <div className="flex items-center gap-3">
          {['TT', 'MI', 'AI'].map((label) => (
            <Avatar key={label}>
              <AvatarFallback>{label}</AvatarFallback>
            </Avatar>
          ))}
        </div>
      );
    case 'badge':
      return (
        <div className="flex flex-wrap gap-2">
          <Badge>{s('stable')}</Badge>
          <Badge variant="secondary">{s('beta')}</Badge>
          <Badge variant="success">{s('active')}</Badge>
          <Badge variant="outline">{s('docs')}</Badge>
        </div>
      );
    case 'breadcrumb':
      return (
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="#">{s('home')}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="#">{s('library')}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{s('components')}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      );
    case 'button':
      return (
        <div className="flex flex-wrap items-center gap-2">
          <Button>
            <Check />
            {s('save')}
          </Button>
          <Button variant="secondary">{s('preview')}</Button>
          <Button size="icon" variant="outline">
            <Settings />
            <span className="sr-only">{s('settings')}</span>
          </Button>
        </div>
      );
    case 'calendar':
      return (
        <div className="max-w-78 rounded-lg border bg-background p-2">
          <Calendar
            defaultMonth={new Date(2026, 5, 1)}
            mode="single"
            preferences={{ weekStartsOn: 1 }}
            selected={new Date(2026, 5, 3)}
          />
        </div>
      );
    case 'card':
      return (
        <Card className="w-full max-w-80">
          <CardHeader>
            <CardTitle>{s('workspaceName')}</CardTitle>
            <CardDescription>{s('cardDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <div className="h-3 w-3/4 rounded bg-muted" />
            <div className="h-3 w-1/2 rounded bg-muted" />
          </CardContent>
        </Card>
      );
    case 'carousel':
      return (
        <Carousel className="mx-auto w-full max-w-72">
          <CarouselContent>
            {[s('preview'), s('usage'), s('customize')].map((label) => (
              <CarouselItem key={label}>
                <div className="flex h-28 items-center justify-center rounded-lg border bg-muted font-medium">
                  {label}
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="-left-4" />
          <CarouselNext className="-right-4" />
        </Carousel>
      );
    default:
      return null;
  }
}
