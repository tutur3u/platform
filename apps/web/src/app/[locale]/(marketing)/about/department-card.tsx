import { Card, CardContent, CardHeader } from '@ncthub/ui/card';
import { cn } from '@ncthub/utils/format';
import Image from 'next/image';

const renderMissionPoints = (mission: string[]) => {
  return (
    <ul className="list-disc space-y-2 pl-5">
      {mission.map((point, index) => {
        const separatorIndex = point.indexOf(':');

        if (separatorIndex !== -1) {
          const title = point.substring(0, separatorIndex).trim();
          const description = point.substring(separatorIndex + 1).trim();
          return (
            <li key={index}>
              <span className="font-semibold">{title}:</span> {description}
            </li>
          );
        }

        return <li key={index}>{point}</li>;
      })}
    </ul>
  );
};

interface DepartmentCardProps {
  name: string;
  image: string;
  bio: string;
  characteristics: string;
  mission: string[];
  core: string[];
  className?: string;
}

export function DepartmentCard({
  name,
  image,
  bio,
  characteristics,
  mission,
  core,
  className,
}: DepartmentCardProps) {
  return (
    <Card
      className={cn(
        'group w-full max-w-7xl overflow-hidden rounded-lg border bg-secondary transition-all duration-300 ease-in-out hover:shadow-lg hover:shadow-primary/20',
        className
      )}
    >
      <CardHeader className="p-6 text-center">
        <h3 className="font-bold text-3xl text-foreground">{name}</h3>
      </CardHeader>
      <div className="grid grid-cols-1 md:grid-cols-2">
        <div className="p-6 md:h-full">
          <div className="relative h-64 w-full overflow-hidden rounded-lg transition-transform duration-300 ease-in-out group-hover:scale-105 md:h-full">
            <Image src={image} fill alt={name} className="object-cover" />
          </div>
        </div>
        <CardContent className="flex flex-1 flex-col justify-center p-6">
          <h2 className="mb-4 font-bold text-2xl text-foreground">{bio}</h2>
          <h3 className="mb-2 font-bold text-3xl text-foreground">
            {characteristics}
          </h3>
          <div className="text-foreground text-lg">
            {renderMissionPoints(mission)}
          </div>
          <div className="mt-4 text-foreground text-lg">
            {core.map((item, index) => (
              <p key={index} className="mb-2">
                {item}
              </p>
            ))}
          </div>
        </CardContent>
      </div>
    </Card>
  );
}
