'use client';

import RoleFormDisplaySection, { RoleFormSchema } from './role-display';
import RoleFormPermissionsSection from './role-permissions';
import { WorkspaceRole } from '@/types/db';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@repo/ui/components/ui/tabs';
import { Monitor, PencilRuler, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as z from 'zod';

export interface Props {
  wsId: string;
  data?: WorkspaceRole;
  onFinish?: (data: z.infer<typeof RoleFormSchema>) => void;
}

export default function RoleForm(props: Props) {
  const t = useTranslations();

  return (
    <Tabs defaultValue="display" className="w-full">
      <TabsList className="grid h-fit w-full grid-cols-1 md:grid-cols-3">
        <TabsTrigger value="display">
          <Monitor className="mr-1 h-5 w-5" />
          {t('ws-roles.display')}
        </TabsTrigger>
        <TabsTrigger value="permissions">
          <PencilRuler className="mr-1 h-5 w-5" />
          {t('ws-roles.permissions')}
        </TabsTrigger>
        <TabsTrigger value="members">
          <Users className="mr-1 h-5 w-5" />
          {t('ws-roles.members')} (0)
        </TabsTrigger>
      </TabsList>
      <TabsContent value="display">
        <RoleFormDisplaySection {...props} />
      </TabsContent>
      <TabsContent value="permissions">
        <RoleFormPermissionsSection {...props} />
      </TabsContent>
      <TabsContent value="members"></TabsContent>
    </Tabs>
  );
}
