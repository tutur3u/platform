'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import {
  Check,
  Crown,
  Filter,
  Settings,
  Shield,
  Users,
} from '@tuturuuu/ui/icons';
import { useRouter, useSearchParams } from 'next/navigation';

interface RoleFilterProps {
  currentRole?: string;
}

export default function RoleFilter({ currentRole }: RoleFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateFilter = (role?: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (role && role !== 'all') {
      params.set('role', role);
    } else {
      params.delete('role');
    }

    // Reset to first page when changing filters
    params.delete('page');

    router.push(`?${params.toString()}`);
  };

  const getRoleConfig = (role?: string) => {
    switch (role) {
      case 'admin':
        return {
          label: 'Admin',
          icon: <Crown className="h-4 w-4 text-dynamic-yellow" />,
          description: 'Full platform access',
        };
      case 'global_manager':
        return {
          label: 'Global Manager',
          icon: <Settings className="h-4 w-4 text-dynamic-blue" />,
          description: 'Manage all challenges',
        };
      case 'challenge_manager':
        return {
          label: 'Challenge Manager',
          icon: <Shield className="h-4 w-4 text-dynamic-purple" />,
          description: 'Manage specific challenges',
        };
      case 'member':
        return {
          label: 'Member',
          icon: <Users className="h-4 w-4 text-dynamic-green" />,
          description: 'Regular platform user',
        };
      default:
        return {
          label: 'All Roles',
          icon: <Filter className="h-4 w-4" />,
          description: 'Show all users',
        };
    }
  };

  const currentConfig = getRoleConfig(currentRole);
  const getFilterVariant = () => {
    return currentRole ? 'default' : 'outline';
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={getFilterVariant()}
          className="flex items-center gap-2 min-w-[140px]"
        >
          {currentConfig.icon}
          {currentConfig.label}
          {currentRole && currentRole !== 'all' && (
            <Badge
              variant="secondary"
              className="ml-1 h-5 w-5 rounded-full p-0 text-xs"
            >
              1
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem
          onClick={() => updateFilter('all')}
          className="flex items-center justify-between p-3"
        >
          <div className="flex items-center gap-3">
            <Filter className="h-4 w-4" />
            <div>
              <div className="font-medium">All Roles</div>
              <div className="text-xs text-dynamic-muted-foreground">
                Show all users
              </div>
            </div>
          </div>
          {(!currentRole || currentRole === 'all') && (
            <Check className="h-4 w-4" />
          )}
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => updateFilter('admin')}
          className="flex items-center justify-between p-3"
        >
          <div className="flex items-center gap-3">
            <Crown className="h-4 w-4 text-dynamic-yellow" />
            <div>
              <div className="font-medium">Admin</div>
              <div className="text-xs text-dynamic-muted-foreground">
                Full platform access
              </div>
            </div>
          </div>
          {currentRole === 'admin' && <Check className="h-4 w-4" />}
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => updateFilter('global_manager')}
          className="flex items-center justify-between p-3"
        >
          <div className="flex items-center gap-3">
            <Settings className="h-4 w-4 text-dynamic-blue" />
            <div>
              <div className="font-medium">Global Manager</div>
              <div className="text-xs text-dynamic-muted-foreground">
                Manage all challenges
              </div>
            </div>
          </div>
          {currentRole === 'global_manager' && <Check className="h-4 w-4" />}
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => updateFilter('challenge_manager')}
          className="flex items-center justify-between p-3"
        >
          <div className="flex items-center gap-3">
            <Shield className="h-4 w-4 text-dynamic-purple" />
            <div>
              <div className="font-medium">Challenge Manager</div>
              <div className="text-xs text-dynamic-muted-foreground">
                Manage specific challenges
              </div>
            </div>
          </div>
          {currentRole === 'challenge_manager' && <Check className="h-4 w-4" />}
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => updateFilter('member')}
          className="flex items-center justify-between p-3"
        >
          <div className="flex items-center gap-3">
            <Users className="h-4 w-4 text-dynamic-green" />
            <div>
              <div className="font-medium">Member</div>
              <div className="text-xs text-dynamic-muted-foreground">
                Regular platform user
              </div>
            </div>
          </div>
          {currentRole === 'member' && <Check className="h-4 w-4" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
