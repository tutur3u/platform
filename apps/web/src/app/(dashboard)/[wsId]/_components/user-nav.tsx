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
  ActivitySquare,
  Globe,
  Palette,
  Settings,
  User,
  UserPlus,
} from 'lucide-react';
import { Suspense } from 'react';
import { LogoutDropdownItem } from './logout-dropdown-item';
import Link from 'next/link';
import { ThemeDropdownItems } from './theme-dropdown-items';
import { LanguageDropdownItem } from './language-dropdown-item';

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
            <AvatarFallback className="font-semibold">
              {user?.display_name ? (
                getInitials(user.display_name)
              ) : (
                <User className="h-5 w-5" />
              )}
            </AvatarFallback>
          </Suspense>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col">
            <p className="line-clamp-1 break-all text-sm font-medium">
              {user?.display_name || user?.handle || `@${user?.id}`}
            </p>
            <p className="text-muted-foreground line-clamp-1 break-all text-xs">
              {user?.email}
            </p>
          </div>
        </DropdownMenuLabel>
        {wsId === undefined && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <Link href="/onboarding">
                <DropdownMenuItem className="cursor-pointer">
                  <ActivitySquare className="mr-2 h-4 w-4" />
                  <span>Dashboard</span>
                </DropdownMenuItem>
              </Link>
            </DropdownMenuGroup>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Palette className="mr-2 h-4 w-4" />
              <span>Theme</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <ThemeDropdownItems />
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
                <LanguageDropdownItem lang="en" label="English" />
                <LanguageDropdownItem lang="vi" label="Tiếng Việt" />
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <Link href="/settings/account">
            <DropdownMenuItem className="cursor-pointer">
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </DropdownMenuItem>
          </Link>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {wsId !== undefined && (
          <>
            <DropdownMenuGroup>
              <Link href={`/${wsId}/members`}>
                <DropdownMenuItem className="cursor-pointer">
                  <UserPlus className="mr-2 h-4 w-4" />
                  <span>Invite users</span>
                </DropdownMenuItem>
              </Link>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}
        {/* <DropdownMenuItem disabled>
          <LifeBuoy className="mr-2 h-4 w-4" />
          <span>Support</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator /> */}
        <LogoutDropdownItem />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
