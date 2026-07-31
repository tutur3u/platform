import { CheckCircle2 } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';

export function SectionHeading({
  description,
  icon: Icon,
  title,
}: {
  description: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="grid size-9 place-items-center rounded-lg border bg-primary/[0.07]">
          <Icon className="size-4 text-primary" />
        </div>
        <h2 className="font-semibold text-xl tracking-tight">{title}</h2>
      </div>
      <p className="mt-2 max-w-3xl text-muted-foreground text-sm">
        {description}
      </p>
    </div>
  );
}

export function StepCard({
  description,
  index,
  title,
}: {
  description: string;
  index: string;
  title: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <Badge className="mb-3" variant="secondary">
          {index}
        </Badge>
        <div className="font-medium">{title}</div>
        <p className="mt-1 text-muted-foreground text-sm">{description}</p>
      </CardContent>
    </Card>
  );
}

export function ExampleCard({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function ActionCard({
  description,
  href,
  icon: Icon,
  title,
}: {
  description: string;
  href?: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
}) {
  const body = (
    <Card className="h-full transition-colors hover:border-primary/30">
      <CardContent className="pt-5">
        <Icon className="mb-3 size-5 text-primary" />
        <div className="font-medium">{title}</div>
        <p className="mt-1 text-muted-foreground text-sm">{description}</p>
      </CardContent>
    </Card>
  );

  return href ? <Link href={href}>{body}</Link> : body;
}

export function ProductionChecklist({ items }: { items: readonly string[] }) {
  return (
    <Card>
      <CardContent className="grid gap-3 pt-6 sm:grid-cols-2">
        {items.map((item) => (
          <div className="flex items-start gap-2 text-sm" key={item}>
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>{item}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
