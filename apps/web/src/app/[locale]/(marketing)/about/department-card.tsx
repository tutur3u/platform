import { Badge } from '@ncthub/ui/badge';
import { Card, CardContent, CardHeader } from '@ncthub/ui/card';
import { cn } from '@ncthub/utils/format';
import Image from 'next/image';

const renderMissionPoints = (mission: string[]) => {
  const badgeStyles = [
    'border-dynamic-orange/80 bg-dynamic-orange/20 text-dynamic-orange',
    'border-dynamic-green/80 bg-dynamic-green/20 text-dynamic-green',
    'border-dynamic-purple/80 bg-dynamic-purple/20 text-dynamic-purple',
    'border-dynamic-red/80 bg-dynamic-red/20 text-dynamic-red',
    'border-dynamic-lime/80 bg-dynamic-lime/20 text-dynamic-lime',
  ];

  return (
    <div className="flex flex-wrap gap-4">
      {mission.map((point, index) => {
        const badgeClass = badgeStyles[index % badgeStyles.length];

        return (
          <Badge
            key={index}
            variant="default"
            className={cn(
              'rounded-full px-3 py-1 font-semibold text-sm',
              badgeClass
            )}
          >
            {point}
          </Badge>
        );
      })}
    </div>
  );
};

interface DepartmentCardProps {
  name: string;
  image: string;
  bio: string;
  characteristics: string;
  mission: string[];
  className?: string;
}

export function DepartmentCard({
  name,
  image,
  bio,
  characteristics,
  mission,
  className,
}: DepartmentCardProps) {
  return (
    <Card
      className={cn(
        'group max-w-7xl rounded-2xl border-2 bg-secondary/80 transition-all duration-300 ease-in-out hover:shadow-lg hover:shadow-secondary/20',
        className
      )}
    >
      <CardHeader className="mt-4 mb-8 text-center">
        <Badge
          variant="outline"
          className={cn(
            'mx-auto rounded-full px-4 py-2 font-bold text-sm uppercase tracking-[0.32em]',
            className
          )}
        >
          {name}
        </Badge>
      </CardHeader>
      <CardContent className="grid gap-10 px-10 pb-10 md:grid-cols-[0.4fr_0.6fr]">
        <div className="space-y-6">
          <p className="text-justify font-medium text-foreground/80 text-md leading-relaxed md:text-lg">
            {bio}
          </p>
          <div className="space-y-4">
            <p className="font-semibold text-muted-foreground text-sm uppercase tracking-[0.32em]">
              {characteristics}
            </p>
            {renderMissionPoints(mission)}
          </div>
        </div>
        <div className="grid grid-cols-6 gap-4">
          {[0, 1, 2, 3, 4].map((item) => (
            <div
              key={item}
              className={cn(
                'relative aspect-square overflow-hidden rounded-xl border border-foreground/10 bg-background/60',
                item <= 1 ? 'col-span-3' : 'col-span-2'
              )}
            >
              <Image
                src={image}
                fill
                alt={name}
                className="object-cover transition duration-500 ease-out hover:scale-105"
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
