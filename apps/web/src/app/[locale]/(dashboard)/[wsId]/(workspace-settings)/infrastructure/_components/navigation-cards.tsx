import { Blocks, Clock, Database, Mail, Users } from '@tuturuuu/ui/icons';
import Link from 'next/link';

interface NavigationCard {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  count?: number;
}

interface Props {
  wsId: string;
  cards: NavigationCard[];
}

export default function NavigationCards({ cards }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => (
        <Link
          key={card.href}
          href={card.href}
          className="group relative overflow-hidden rounded-lg border border-border bg-card p-6 transition-all hover:border-primary/20 hover:shadow-lg"
        >
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-primary/10 p-3 transition-colors group-hover:bg-primary/20">
              {card.icon}
            </div>
            <div className="flex-1">
              <h3 className="mb-1 font-semibold text-lg transition-colors group-hover:text-primary">
                {card.title}
              </h3>
              <p className="text-muted-foreground text-sm">
                {card.description}
              </p>
              {card.count !== undefined && (
                <div className="mt-3">
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-primary text-sm">
                    {card.count} {card.count === 1 ? 'item' : 'items'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

// Export common icons for use
export { Blocks, Clock, Database, Mail, Users };
