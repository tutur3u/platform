import { LanguageWrapper } from './(dashboard)/_components/language-wrapper';
import { LogoutDropdownItem } from './(dashboard)/_components/logout-dropdown-item';
import { SystemLanguageWrapper } from './(dashboard)/_components/system-language-wrapper';
import { ThemeDropdownItems } from './(dashboard)/_components/theme-dropdown-items';
import DashboardMenuItem from './dashboard-menu-item';
import InviteMembersMenuItem from './invite-members-menu-item';
import MeetTogetherMenuItem from './meet-together-menu-item';
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
import { getWorkspaces } from '@/lib/workspace-helper';
import { getInitials } from '@/utils/name-helper';
import { Globe, Palette, Settings, User } from 'lucide-react';
import useTranslation from 'next-translate/useTranslation';
import Link from 'next/link';
import { Suspense } from 'react';

export async function UserNav() {
  const { t } = useTranslation('common');

  const user = await getCurrentUser(true);
  const workspaces = await getWorkspaces(true);

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Avatar className="relative cursor-pointer overflow-visible font-semibold">
          <Suspense fallback={<AvatarFallback>?</AvatarFallback>}>
            <AvatarImage
              src={user?.avatar_url ?? undefined}
              className="overflow-clip rounded-full"
            />
            <AvatarFallback className="font-semibold">
              {user?.display_name ? (
                getInitials(user.display_name)
              ) : (
                <User className="h-5 w-5" />
              )}
            </AvatarFallback>
            <div className="border-background absolute bottom-0 right-0 z-20 h-3 w-3 rounded-full border-2 bg-green-500 dark:bg-green-400" />
          </Suspense>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col">
            <Link
              href="/settings/account"
              className="line-clamp-1 w-fit break-all text-sm font-medium hover:underline"
            >
              {user?.display_name || user?.handle || t('common:unnamed')}
            </Link>
            <p className="text-muted-foreground line-clamp-1 break-all text-xs">
              {user?.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DashboardMenuItem defaultWorkspaceId={workspaces?.[0]?.id} />
        <MeetTogetherMenuItem />
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Palette className="mr-2 h-4 w-4" />
              <span>{t('theme')}</span>
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
              <span>{t('language')}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <LanguageWrapper locale="en" label="English" />
                <LanguageWrapper locale="vi" label="Tiếng Việt" />
                <DropdownMenuSeparator />
                <SystemLanguageWrapper />
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <Link href="/settings/account">
            <DropdownMenuItem className="cursor-pointer">
              <Settings className="mr-2 h-4 w-4" />
              <span>{t('settings')}</span>
            </DropdownMenuItem>
          </Link>
        </DropdownMenuGroup>
        <InviteMembersMenuItem />
        <DropdownMenuSeparator />
        <LogoutDropdownItem />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
