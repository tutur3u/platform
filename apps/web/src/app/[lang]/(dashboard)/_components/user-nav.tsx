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
import { LanguageWrapper } from './language-wrapper';
import useTranslation from 'next-translate/useTranslation';
import { SystemLanguageWrapper } from './system-language-wrapper';
import { getWorkspaces } from '@/lib/workspace-helper';

interface Props {
  wsId?: string;
}

export async function UserNav({ wsId }: Props) {
  const { t } = useTranslation('common');

  const user = await getCurrentUser();
  const workspaces = await getWorkspaces(true);

  return (
    <DropdownMenu modal={false}>
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
        {wsId === undefined && workspaces?.[0]?.id !== undefined && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <Link href={`/${workspaces[0].id}`}>
                <DropdownMenuItem className="cursor-pointer">
                  <ActivitySquare className="mr-2 h-4 w-4" />
                  <span>{t('dashboard')}</span>
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
        <DropdownMenuSeparator />
        {wsId !== undefined && (
          <>
            <DropdownMenuGroup>
              <Link href={`/${wsId}/members`}>
                <DropdownMenuItem className="cursor-pointer">
                  <UserPlus className="mr-2 h-4 w-4" />
                  <span>{t('invite_users')}</span>
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
