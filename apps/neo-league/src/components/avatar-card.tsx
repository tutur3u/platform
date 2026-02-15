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
        'group card-hover relative flex h-full flex-col items-center',
        containerClassName
      )}
    >
      {/* Top right corner border */}
      <div className="transform-all absolute top-0 right-0 z-10 h-12 w-12 rounded-tr-xl border-brand-light-yellow border-t-4 border-r-4 opacity-60 duration-300 group-hover:opacity-100" />

      {/* Bottom left corner border */}
      <div className="absolute bottom-0 left-0 z-10 h-12 w-12 rounded-bl-xl border-brand-light-blue border-b-4 border-l-4 opacity-60 duration-300 group-hover:opacity-100" />

      <div
        className={cn(
          'relative h-64 w-full overflow-hidden rounded-t-xl bg-linear-to-r from-primary/80 to-primary/60',
          backgroundClassName
        )}
      >
        <Avatar className={cn('h-full w-full rounded-none', avatarClassName)}>
          <AvatarImage src={avatar} alt={name} className="object-cover" />
          <AvatarFallback
            className={cn(
              'rounded-none bg-transparent font-black text-2xl text-white',
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
          'glass-card w-full flex-1 rounded-b-xl px-6 py-8 text-center',
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
