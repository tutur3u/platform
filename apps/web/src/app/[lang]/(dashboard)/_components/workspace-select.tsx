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
import { usePathname, useRouter } from 'next/navigation';

interface Props {
  wsId?: string;
  workspaces: Workspace[];
}
export default function WorkspaceSelect({ wsId, workspaces }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const onValueChange = (wsId: string) => {
    const newPathname = pathname?.replace(/^\/[^/]+/, `/${wsId}`);
    if (newPathname) router.push(newPathname);
  };

  return (
    <Select value={wsId} onValueChange={onValueChange}>
      <SelectTrigger className="w-48">
        <SelectValue placeholder="Select a workspace" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {workspaces.map((workspace) => (
            <SelectItem key={workspace.id} value={workspace.id}>
              {workspace.name}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
