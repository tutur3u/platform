import { Sparkles } from '@tuturuuu/icons';
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@tuturuuu/ui/dropdown-menu';
import Link from 'next/link';
import { DEV_MODE } from '@/constants/common';

export default function RewiseMenuItem() {
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <Link href={DEV_MODE ? 'http://localhost:7804' : 'https://rewise.me'}>
          <DropdownMenuItem className="cursor-pointer">
            <Sparkles className="h-4 w-4 text-dynamic-orange" />
            <span>Rewise</span>
          </DropdownMenuItem>
        </Link>
      </DropdownMenuGroup>
    </>
  );
}
