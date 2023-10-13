'use client';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Workspace } from '@/types/primitives/Workspace';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter, useParams, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function WorkspaceSelect() {
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();

  const onValueChange = (wsId: string) => {
    const newPathname = pathname?.replace(/^\/[^/]+/, `/${wsId}`);
    if (newPathname) router.push(newPathname);
  };

  const wsId = params.wsId as string;
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);

  useEffect(() => {
    const getWorkspaces = async () => {
      const supabase = createClientComponentClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return null;

      const { data, error } = await supabase
        .from('workspaces')
        .select(
          'id, name, preset, avatar_url, logo_url, created_at, workspace_members!inner(role)'
        )
        .eq('workspace_members.user_id', user.id);

      if (error) {
        console.error(error);
        return null;
      }

      return data as Workspace[];
    };

    if (wsId) getWorkspaces().then(setWorkspaces);
  }, [wsId]);

  if (!wsId || !workspaces) return null;

  return workspaces ? (
    <>
      <div className="bg-foreground/20 h-4 w-[1px] rotate-[30deg]" />
      <Select value={wsId} onValueChange={onValueChange}>
        <SelectTrigger className="w-full md:w-48">
          <SelectValue placeholder="Select a workspace" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {workspaces.map((workspace) => (
              <SelectItem key={workspace.id} value={workspace.id}>
                <span className="line-clamp-1">{workspace.name}</span>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </>
  ) : null;
}
