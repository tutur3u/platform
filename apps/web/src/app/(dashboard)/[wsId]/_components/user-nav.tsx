import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getCurrentUser } from '@/lib/user-helper';
import { getInitials } from '@/utils/name-helper';
import {
  Globe,
  LifeBuoy,
  Moon,
  Palette,
  Settings,
  Sparkle,
  Sun,
  UserPlus,
} from 'lucide-react';
import { Suspense } from 'react';
import { LogoutDropdownItem } from './logout-dropdown-item';
import Link from 'next/link';

interface Props {
  wsId?: string;
}

export async function UserNav({ wsId }: Props) {
  const user = await getCurrentUser();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Avatar className="cursor-pointer font-semibold">
          <Suspense fallback={<AvatarFallback>...</AvatarFallback>}>
            <AvatarImage src={user?.avatar_url ?? undefined} />
            <AvatarFallback>
              {getInitials(user?.display_name || '?')}
            </AvatarFallback>
          </Suspense>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="line-clamp-1 text-sm font-medium leading-none">
              {user?.display_name || user?.handle || `@${user?.id}`}
            </p>
            <p className="text-muted-foreground line-clamp-1 text-xs leading-none">
              {user?.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Palette className="mr-2 h-4 w-4" />
              <span>Theme</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuItem>
                  <Sun className="mr-2 h-4 w-4" />
                  <span>Light</span>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Moon className="mr-2 h-4 w-4" />
                  <span>Dark</span>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Sparkle className="mr-2 h-4 w-4" />
                  <span>Automatic</span>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Globe className="mr-2 h-4 w-4" />
              <span>Language</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuItem>English</DropdownMenuItem>
                <DropdownMenuItem>Tiếng Việt</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuItem>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {wsId && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <Link href={`/${wsId}/members`}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  <span>Invite users</span>
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem disabled>
          <LifeBuoy className="mr-2 h-4 w-4" />
          <span>Support</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <LogoutDropdownItem />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
