'use client';
import { UserRound } from '@tuturuuu/icons';
import { DropdownMenuItem } from '@tuturuuu/ui/dropdown-menu';

/**
 * The account menu's Profile entry. With `onOpen` it opens the profile in the
 * app's settings dialog; otherwise it links to the public page.
 */
export function PublicProfileMenuItem({
  href,
  label,
  onOpen,
}: {
  href: string;
  label: string;
  onOpen?: () => void;
}) {
  if (onOpen) {
    return (
      <DropdownMenuItem
        className="cursor-pointer"
        onSelect={() => {
          // Let the menu close first so focus lands in the dialog.
          setTimeout(onOpen, 0);
        }}
      >
        <UserRound className="h-4 w-4 text-muted-foreground" />
        <span>{label}</span>
      </DropdownMenuItem>
    );
  }
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
