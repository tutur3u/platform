'use client';
import { UserRound } from '@tuturuuu/icons';
import { DropdownMenuItem } from '@tuturuuu/ui/dropdown-menu';

export function PublicProfileMenuItem({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <DropdownMenuItem asChild>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="cursor-pointer"
      >
        <UserRound className="h-4 w-4 text-muted-foreground" />
        <span>{label}</span>
      </a>
    </DropdownMenuItem>
  );
}
