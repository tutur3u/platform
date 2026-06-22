import { Sparkles } from '@tuturuuu/icons/lucide-static';
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@tuturuuu/ui/dropdown-menu';
import { getTuturuuuPortlessAppOrigin } from '@tuturuuu/utils/portless';
import Link from 'next/link';
import { DEV_MODE } from '@/constants/common';

export default function RewiseMenuItem() {
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <Link
          href={
            DEV_MODE
              ? getTuturuuuPortlessAppOrigin('rewise')
              : 'https://rewise.me'
          }
        >
          <DropdownMenuItem className="cursor-pointer">
            <Sparkles className="h-4 w-4 text-dynamic-orange" />
            <span>Rewise</span>
          </DropdownMenuItem>
        </Link>
      </DropdownMenuGroup>
    </>
  );
}
