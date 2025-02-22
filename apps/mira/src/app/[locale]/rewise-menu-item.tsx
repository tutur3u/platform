import { DEV_MODE } from '@/constants/common';
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@tuturuuu/ui/dropdown-menu';
import { Sparkles } from 'lucide-react';
import Link from 'next/link';

export default function RewiseMenuItem() {
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <Link href={DEV_MODE ? 'http://localhost:7804' : 'https://rewise.me'}>
          <DropdownMenuItem className="cursor-pointer">
            <Sparkles className="mr-2 h-4 w-4" />
            <span>Rewise</span>
          </DropdownMenuItem>
        </Link>
      </DropdownMenuGroup>
    </>
  );
}
