import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';

interface NavLinkProps extends React.HTMLAttributes<HTMLDivElement> {
  href: string;
  isCollapsed: boolean;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
}

export function NavLink({
  href,
  isCollapsed,
  label,
  icon,
  disabled,
  ...props
}: NavLinkProps) {
  if (disabled) {
    return (
      <div
        data-collapsed={isCollapsed}
        className={cn(
          'group flex w-full items-center justify-between rounded-md px-3 py-2 font-medium text-sm',
          'data-[collapsed=true]:justify-center data-[collapsed=true]:px-2.5',
          'cursor-not-allowed opacity-50'
        )}
        {...props}
      >
        <div
          className={cn(
            'flex w-full items-center gap-3',
            'data-[collapsed=true]:justify-center'
          )}
          data-collapsed={isCollapsed}
        >
          {icon}
          <span
            className={cn('truncate', 'data-[collapsed=true]:hidden')}
            data-collapsed={isCollapsed}
          >
            {label}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      data-collapsed={isCollapsed}
      className={cn(
        'group flex w-full items-center justify-between rounded-md px-3 py-2 font-medium text-sm hover:bg-accent hover:text-accent-foreground',
        'data-[collapsed=true]:justify-center data-[collapsed=true]:px-2.5'
      )}
      {...props}
    >
      <Link
        href={href}
        className={cn(
          'flex w-full items-center gap-3',
          'data-[collapsed=true]:justify-center'
        )}
        data-collapsed={isCollapsed}
      >
        {icon}
        <span
          className={cn('truncate', 'data-[collapsed=true]:hidden')}
          data-collapsed={isCollapsed}
        >
          {label}
        </span>
      </Link>
    </div>
  );
}
