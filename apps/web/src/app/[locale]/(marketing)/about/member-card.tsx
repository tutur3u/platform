import { Card, CardContent, CardFooter, CardHeader } from '@ncthub/ui/card';
import { Facebook, Linkedin } from '@ncthub/ui/icons';
import Image from 'next/image';
import Link from 'next/link';

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

export default function MemberCard({
  name,
  role,
  image,
  bio,
  quote,
  socials,
}: MemberCardProps) {
  return (
    <Card className="group relative flex w-full max-w-sm flex-col overflow-hidden rounded-lg border-1 border-transparent bg-calendar-bg-blue transition-all duration-300 ease-in-out hover:border-foreground/20 hover:shadow-lg hover:shadow-primary/20">
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
            <h3 className="text-xl font-bold text-white">{name}</h3>
            <p className="text-md font-medium text-muted-foreground">{role}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-4">
        <p className="text-muted-foreground italic">"{quote}"</p>
        <p className="mt-2 text-sm text-foreground/80">{bio}</p>
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
