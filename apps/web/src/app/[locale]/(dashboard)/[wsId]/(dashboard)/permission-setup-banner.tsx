'use client';

import { useQuery } from '@tanstack/react-query';
import { Settings, ShieldAlert, X } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface PermissionSetupBannerProps {
  wsId: string;
  isCreator: boolean;
}

export default function PermissionSetupBanner({
  wsId,
  isCreator,
}: PermissionSetupBannerProps) {
  const t = useTranslations();
  const [dismissed, setDismissed] = useState(false);

  const { data: hasPermissions, isLoading } = useQuery({
    queryKey: ['workspace-permissions-configured', wsId],
    queryFn: async () => {
      const supabase = createClient();

      // Check for default permissions
      const { data: defaultPerms, error: defaultError } = await supabase
        .from('workspace_default_permissions')
        .select('permission')
        .eq('ws_id', wsId)
        .eq('enabled', true)
        .limit(1);

      if (defaultError) {
        console.error('Error checking default permissions:', defaultError);
        return true; // Don't show banner on error
      }

      if (defaultPerms && defaultPerms.length > 0) {
        return true;
      }

      // Check for roles with permissions
      const { data: roles, error: rolesError } = await supabase
        .from('workspace_roles')
        .select('id')
        .eq('ws_id', wsId)
        .limit(1);

      if (rolesError) {
        console.error('Error checking roles:', rolesError);
        return true; // Don't show banner on error
      }

      if (roles && roles.length > 0) {
        return true;
      }

      return false;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Don't show banner if loading, already has permissions, not creator, or dismissed
  if (isLoading || hasPermissions || !isCreator || dismissed) {
    return null;
  }

  return (
    <Alert className="border-dynamic-yellow/50 bg-dynamic-yellow/10 lg:col-span-2">
      <ShieldAlert className="size-5 text-dynamic-yellow" />
      <AlertTitle className="flex items-center justify-between">
        <span>{t('dashboard.permission_setup_title')}</span>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={() => setDismissed(true)}
        >
          <X className="size-4" />
        </Button>
      </AlertTitle>
      <AlertDescription className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-foreground/80 text-sm">
          {t('dashboard.permission_setup_description')}
        </p>
        <Button variant="outline" size="sm" asChild className="shrink-0">
          <Link href={`/${wsId}/roles`}>
            <Settings className="mr-2 size-4" />
            {t('dashboard.configure_permissions')}
          </Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
