import { Clock, FileText } from '@tuturuuu/icons/lucide';

interface TocItem {
  id: string;
  title: string;
  number: number;
}

interface TableOfContentsProps {
  items: TocItem[];
  effectiveDate: string;
}

export function TableOfContents({
  items,
  effectiveDate,
}: TableOfContentsProps) {
  return (
    <div
      className="rounded-xl border bg-card p-6 text-card-foreground shadow-sm"
      style={{
        animation: 'legal-slide-in-left 0.6s ease-out 0.2s both',
      }}
    >
      <h2 className="mb-4 flex items-center font-semibold text-lg">
        <FileText className="mr-2 h-5 w-5 text-primary" />
        Table of Contents
      </h2>
      <div className="mb-3 flex items-center text-muted-foreground text-xs">
        <Clock className="mr-1 h-3 w-3" />
        <span>
          Updated:{' '}
          {new Date(effectiveDate).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </span>
      </div>
      <div className="my-2 h-px bg-border" />
      <div className="max-h-[calc(100vh-350px)] overflow-y-auto pr-3">
        <div className="space-y-1 py-2">
          {items.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="flex items-center justify-between rounded-md px-3 py-2 text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground"
            >
              <div className="flex items-center">
                <span className="mr-2 w-5 text-primary/70 text-xs">
                  {item.number.toString().padStart(2, '0')}
                </span>
                {item.title}
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
