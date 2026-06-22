import { ArrowRight } from '@tuturuuu/icons/lucide-static';
import { Button } from '@tuturuuu/ui/button';
import { TUTURUUU_LOCAL_LOGO_URL } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { DOCS_URL } from './links';

export function UiDocsTopbar({ locale }: { locale: string }) {
  return (
    <header className="sticky top-0 z-40 hidden border-b bg-background/85 backdrop-blur lg:block">
      <div className="flex min-h-16 items-center justify-between gap-4 px-10">
        <a className="flex items-center gap-2" href={`/${locale}`}>
          <img
            alt="Tuturuuu"
            className="size-8"
            height={32}
            src={TUTURUUU_LOCAL_LOGO_URL}
            width={32}
          />
          <span className="font-bold text-2xl">Tuturuuu</span>
        </a>
        <nav className="flex items-center gap-1 text-sm">
          <Button asChild size="sm" variant="ghost">
            <a href={`/${locale}/about`}>About</a>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <a href={`/${locale}/products/tasks`}>Products</a>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <a href={`/${locale}/security`}>Security</a>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <a href={DOCS_URL} rel="noreferrer" target="_blank">
              Docs
              <ArrowRight className="size-3.5" />
            </a>
          </Button>
          <Button asChild size="sm">
            <a href={`/${locale}/pricing`}>Get started</a>
          </Button>
        </nav>
      </div>
    </header>
  );
}
