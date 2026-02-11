import { Avatar, AvatarFallback, AvatarImage } from '@ncthub/ui/avatar';
import { cn } from '@ncthub/utils/format';
import { getInitials } from '@ncthub/utils/name-helper';

interface AvatarCardProps {
  avatar: string;
  name: string;
  subtitle: string;
  avatarClassName?: string;
  fallbackClassName?: string;
  containerClassName?: string;
  backgroundClassName?: string;
  cardClassName?: string;
  nameClassName?: string;
  subtitleClassName?: string;
}

export default function AvatarCard({
  avatar,
  name,
  subtitle,
  avatarClassName,
  fallbackClassName,
  containerClassName,
  backgroundClassName,
  cardClassName,
  nameClassName,
  subtitleClassName,
}: AvatarCardProps) {
  return (
    <div
      className={cn(
        'card-hover flex flex-col items-center',
        containerClassName
      )}
    >
      <div
        className={cn(
          'relative h-64 w-full overflow-hidden rounded-t-xl bg-linear-to-r from-background/20 to-background',
          backgroundClassName
        )}
      >
        <Avatar className={cn('h-full w-full rounded-none', avatarClassName)}>
          <AvatarImage src={avatar} alt={name} className="object-contain" />
          <AvatarFallback
            className={cn(
              'gradient-bg font-black text-2xl text-white',
              fallbackClassName
            )}
          >
            {getInitials(name)}
          </AvatarFallback>
        </Avatar>
        <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/50 via-black/5 to-transparent"></div>
      </div>
      <div
        className={cn(
          'glass-card h-full w-full rounded-b-xl px-6 py-8 text-center',
          cardClassName
        )}
      >
        <h4 className={cn('mb-1 font-black', nameClassName)}>{name}</h4>
        <p className={cn('text-base text-foreground', subtitleClassName)}>
          {subtitle}
        </p>
      </div>
    </div>
  );
}
