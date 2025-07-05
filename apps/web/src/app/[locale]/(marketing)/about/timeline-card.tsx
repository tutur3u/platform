import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@ncthub/ui/card';
import { cn } from '@ncthub/utils/format';

interface TimelineCardProps {
  year: string;
  title: string;
  description: string;
  isSelected: boolean;
}

export function TimelineCard({
  year,
  title,
  description,
  isSelected,
}: TimelineCardProps) {
  return (
    <Card
      className={cn(
        'relative h-full overflow-hidden border-2 border-border/50 bg-card/80 shadow-lg',
        'transition-all duration-500 ease-in-out hover:shadow-xl',
        isSelected ? 'scale-100 opacity-100' : 'scale-75 opacity-60'
      )}
    >
      <div
        className={cn(
          'absolute inset-0 transition-all duration-500',
          isSelected ? 'bg-transparent' : 'bg-muted/60'
        )}
      />
      <CardHeader className="items-center gap-4">
        <div className="flex size-28 items-center justify-center rounded-full bg-gradient-to-br from-brand-light-blue to-brand-light-yellow p-1 shadow-md">
          <div className="flex size-full items-center justify-center rounded-full border-2 border-brand-light-blue/20 bg-card">
            <p className="text-xl font-bold text-brand-dark-blue">{year}</p>
          </div>
        </div>
        <CardTitle className="text-center text-xl font-bold text-card-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <CardDescription className="text-center text-sm text-muted-foreground">
          {description}
        </CardDescription>
      </CardContent>
    </Card>
  );
}
