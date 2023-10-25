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
import { useRouter, useParams, usePathname } from 'next/navigation';

interface Props {
  workspaces: Workspace[] | null;
}

export default function WorkspaceSelect({ workspaces }: Props) {
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();

  const onValueChange = (wsId: string) => {
    const newPathname = pathname?.replace(/^\/[^/]+/, `/${wsId}`);
    if (newPathname) router.push(newPathname);
  };

  const wsId = params.wsId as string;
  if (!wsId || !workspaces?.length) return null;

  return (
    <>
      <div className="bg-foreground/20 h-4 w-[1px] rotate-[30deg]" />
      <Select value={wsId} onValueChange={onValueChange}>
        <SelectTrigger className="w-full md:w-48">
          <SelectValue placeholder="Select a workspace" />
        </SelectTrigger>
        <SelectContent onCloseAutoFocus={(e) => e.preventDefault()}>
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
  );
}
