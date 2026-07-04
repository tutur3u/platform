import { ArrowLeft, ArrowRight } from '@tuturuuu/icons/lucide-static';
import { Button } from '@tuturuuu/ui/button';
import { Separator } from '@tuturuuu/ui/separator';

export interface TocItem {
  id: string;
  label: string;
}

export function OnThisPage({
  items,
  title,
}: {
  items: TocItem[];
  title: string;
}) {
  if (!items.length) return null;

  return (
    <aside className="hidden xl:block">
      <div className="sticky top-20 grid gap-3">
        <div className="font-medium text-sm">{title}</div>
        <nav className="grid gap-2 text-muted-foreground text-sm">
          {items.map((item) => (
            <a
              className="hover:text-foreground"
              href={`#${item.id}`}
              key={item.id}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </aside>
  );
}

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
            <a href={previous.href}>
              <ArrowLeft className="size-4" />
              <span className="grid text-left">
                <span className="text-muted-foreground text-xs">
                  {previous.label}
                </span>
                <span>{previous.title}</span>
              </span>
            </a>
          </Button>
        ) : (
          <span />
        )}
        {next ? (
          <Button asChild className="h-auto justify-end p-4" variant="outline">
            <a href={next.href}>
              <span className="grid text-right">
                <span className="text-muted-foreground text-xs">
                  {next.label}
                </span>
                <span>{next.title}</span>
              </span>
              <ArrowRight className="size-4" />
            </a>
          </Button>
        ) : null}
      </nav>
    </>
  );
}
