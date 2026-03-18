import { Badge } from '@ncthub/ui/badge';
import { Card, CardContent, CardHeader } from '@ncthub/ui/card';
import { cn } from '@ncthub/utils/format';
import Image from 'next/image';
import type { CoreDepartmentName, DepartmentData } from './data';

const badgeStyles = [
  'border-dynamic-orange/80 bg-dynamic-orange/20 text-dynamic-orange',
  'border-dynamic-green/80 bg-dynamic-green/20 text-dynamic-green',
  'border-dynamic-purple/80 bg-dynamic-purple/20 text-dynamic-purple',
  'border-dynamic-red/80 bg-dynamic-red/20 text-dynamic-red',
  'border-dynamic-lime/80 bg-dynamic-lime/20 text-dynamic-lime',
];

const departmentThemes: Record<
  CoreDepartmentName,
  {
    card: string;
    text: string;
    bg: string;
    border: string;
    glow: string;
  }
> = {
  Technology: {
    card: 'bg-dynamic-blue/5 text-dynamic-blue border-dynamic-blue/20 hover:bg-dynamic-blue/10',
    text: 'text-dynamic-blue',
    bg: 'bg-dynamic-blue/10',
    border: 'border-dynamic-blue/20',
    glow: 'from-dynamic-blue/12 via-dynamic-blue/4 to-transparent',
  },
  'Human Resources': {
    card: 'bg-dynamic-purple/5 text-dynamic-purple border-dynamic-purple/20 hover:bg-dynamic-purple/10',
    text: 'text-dynamic-purple',
    bg: 'bg-dynamic-purple/10',
    border: 'border-dynamic-purple/20',
    glow: 'from-dynamic-purple/12 via-dynamic-purple/4 to-transparent',
  },
  Marketing: {
    card: 'bg-dynamic-orange/5 text-dynamic-orange border-dynamic-orange/20 hover:bg-dynamic-orange/10',
    text: 'text-dynamic-orange',
    bg: 'bg-dynamic-orange/10',
    border: 'border-dynamic-orange/20',
    glow: 'from-dynamic-orange/12 via-dynamic-orange/4 to-transparent',
  },
};

interface DepartmentCardProps {
  name: CoreDepartmentName;
  bio: string;
  characteristics: DepartmentData['characteristics'];
  activities: DepartmentData['activities'];
}

export function DepartmentCard({
  name,
  bio,
  characteristics,
  activities,
}: DepartmentCardProps) {
  const theme = departmentThemes[name];

  return (
    <Card
      className={cn(
        'group w-full max-w-7xl overflow-hidden rounded-4xl border-2 bg-secondary/80 transition-all duration-300 ease-in-out hover:shadow-lg hover:shadow-secondary/20',
        theme.card
      )}
    >
      <CardHeader className="mt-4 mb-2 space-y-4 text-center">
        <Badge
          variant="outline"
          className={cn(
            'mx-auto rounded-full px-4 py-2 font-bold text-md uppercase tracking-[0.32em]',
            theme.border,
            theme.bg,
            theme.text
          )}
        >
          {name}
        </Badge>

        <div className="mx-auto max-w-3xl text-center">
          <p className="text-balance font-medium text-foreground/80 text-md leading-8 md:text-lg">
            {bio}
          </p>
        </div>
      </CardHeader>

      <CardContent className="relative space-y-10 px-5 pb-8 md:px-8 lg:px-10 lg:pb-10">
        <div
          className={cn(
            'pointer-events-none absolute inset-x-10 top-28 h-56 rounded-full bg-linear-to-r blur-3xl',
            theme.glow
          )}
        />
        <div className="grid items-center gap-8 pt-8 lg:grid-cols-2">
          <div className="space-y-6">
            <div className="space-y-3">
              <p className="font-semibold text-muted-foreground text-sm uppercase tracking-[0.32em]">
                Our Characteristics
              </p>
              <h3 className="max-w-xl font-bold text-2xl leading-tight md:text-3xl">
                {characteristics.bio}
              </h3>
            </div>

            <div className="flex flex-wrap gap-3">
              {characteristics.badges.map((point, index) => {
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

            <p className="max-w-2xl text-foreground/70 text-sm leading-7 md:text-base">
              {characteristics.quote}
            </p>
          </div>

          <div className="relative min-h-80 overflow-hidden rounded-[30px]">
            <Image
              src={characteristics.image}
              fill
              alt={`${name} featured activity`}
              className="object-cover transition duration-700 ease-out group-hover:scale-105"
            />
          </div>
        </div>

        <div className="grid gap-10 pt-12 lg:grid-cols-2 lg:items-start">
          <div className="space-y-8">
            <div className="space-y-3">
              <p className="font-semibold text-muted-foreground text-sm uppercase tracking-[0.32em]">
                Our Activities
              </p>

              <h3 className="max-w-2xl font-bold text-3xl leading-tight md:text-4xl">
                {activities.bio}
              </h3>
            </div>

            <div className="space-y-8">
              {activities.items.map((activity, index) => (
                <div
                  key={activity.title}
                  className="grid grid-cols-[auto_1fr] gap-4"
                >
                  <div className="pt-1">
                    <div
                      className={cn(
                        'flex h-12 w-12 items-center justify-center rounded-full border font-bold text-sm',
                        theme.border,
                        theme.bg,
                        theme.text
                      )}
                    >
                      0{index + 1}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-4">
                      <p
                        className={cn(
                          'font-semibold text-lg leading-none md:text-xl',
                          theme.text
                        )}
                      >
                        {activity.title}
                      </p>
                    </div>

                    <p className="max-w-xl text-foreground/75 text-sm leading-7 md:text-base">
                      {activity.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 md:gap-5">
            {activities.images.map((image, index) => (
              <div
                key={`${image}-${index}`}
                className={cn(
                  'group/image relative aspect-square overflow-hidden rounded-[26px] border bg-background/50',
                  theme.border
                )}
              >
                <Image
                  src={image}
                  fill
                  alt={`${name} activity ${index + 1}`}
                  className="object-cover transition duration-500 ease-out group-hover/image:scale-105"
                />
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
