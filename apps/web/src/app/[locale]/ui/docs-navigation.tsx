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
