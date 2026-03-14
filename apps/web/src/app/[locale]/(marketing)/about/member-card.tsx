import { Card, CardContent, CardFooter, CardHeader } from '@ncthub/ui/card';
import { Facebook, Linkedin } from '@ncthub/ui/icons';
import { cn } from '@ncthub/utils/format';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

interface MemberCardProps {
  name: string;
  role: string;
  image: string;
  bio: string;
  quote: string;
  generation?: number;
  socials: {
    facebook?: string;
    linkedin?: string;
  };
}

interface DepartmentCardProps {
  name: string;
  image: string;
  bio: string;
  characteristics: string;
  quote: ReactNode;
  core: string[];
  className?: string;
}

export default function MemberCard({
  name,
  role,
  image,
  bio,
  quote,
  socials,
}: MemberCardProps) {
  return (
    <Card className="group relative flex w-full max-w-sm flex-col overflow-hidden rounded-lg border border-border bg-card transition-all duration-300 ease-in-out hover:border-foreground/30 hover:shadow-lg hover:shadow-primary/20">
      <CardHeader className="p-0">
        <div className="relative h-64 w-full overflow-hidden transition-transform duration-300 ease-in-out group-hover:scale-105">
          <Image
            src={image}
            fill
            alt={name}
            className="object-cover object-top"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/5 to-transparent" />
          <div className="absolute bottom-0 w-full p-4">
            <h3 className="font-bold text-white text-xl">{name}</h3>
            <p className="font-medium text-md text-muted-foreground">{role}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-4">
        <p className="text-muted-foreground italic">"{quote}"</p>
        <p className="mt-2 text-foreground/80 text-sm">{bio}</p>
      </CardContent>
      <CardFooter className="flex justify-center gap-4 p-4 pt-0">
        {socials.facebook ? (
          <Link
            href={socials.facebook}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Facebook className="h-6 w-6 text-muted-foreground transition-colors hover:text-primary" />
          </Link>
        ) : (
          <Facebook className="h-6 w-6 text-muted-foreground" />
        )}

        {socials.linkedin ? (
          <Link
            href={socials.linkedin}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Linkedin className="h-6 w-6 text-muted-foreground transition-colors hover:text-primary" />
          </Link>
        ) : (
          <Linkedin className="h-6 w-6 text-muted-foreground" />
        )}
      </CardFooter>
    </Card>
  );
}

export function DepartmentCard({
  name,
  image,
  bio,
  characteristics,
  quote,
  core,
  className,
}: DepartmentCardProps) {
  return (
    <Card
      className={cn(
        'group w-full max-w-7xl overflow-hidden rounded-lg border bg-secondary transition-all duration-300 ease-in-out hover:border-foreground/30 hover:shadow-lg hover:shadow-primary/20',
        className
      )}
    >
      <CardHeader className="p-6 text-center">
        <h3 className="font-bold text-3xl text-white">{name}</h3>
      </CardHeader>
      <div className="grid grid-cols-1 md:grid-cols-2">
        <div className="p-6 md:h-full">
          <div className="relative h-64 w-full overflow-hidden rounded-lg transition-transform duration-300 ease-in-out group-hover:scale-105 md:h-full">
            <Image src={image} fill alt={name} className="object-cover" />
          </div>
        </div>
        <CardContent className="flex flex-1 flex-col justify-center p-6">
          <h2 className="mb-4 font-bold text-2xl text-white">{bio}</h2>
          <h3 className="mb-2 font-bold text-3xl text-white">
            {characteristics}
          </h3>
          <div className="text-lg text-muted-foreground text-white">
            {quote}
          </div>
          <div className="text-lg text-muted-foreground text-white">
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
