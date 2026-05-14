'use client';

import {
  Eraser,
  Pencil,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Trash2,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import type { HiveServer } from '@/engine/types';

type HiveServerAdminControlsProps = {
  labels: {
    admin: string;
    clear: string;
    create: string;
    delete: string;
    edit: string;
    reseed: string;
  };
  onCreateServer: () => void;
  onDeleteServer: (server: HiveServer) => void;
  onEditServer: (server: HiveServer) => void;
  onResetWorld: (mode: 'clear' | 'reseed') => void;
  server?: HiveServer | null;
};

export function HiveServerAdminControls({
  labels,
  onCreateServer,
  onDeleteServer,
  onEditServer,
  onResetWorld,
  server,
}: HiveServerAdminControlsProps) {
  return (
    <div className="space-y-2 border-border border-t pt-3">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <ShieldCheck className="h-3.5 w-3.5 text-dynamic-green" />
        {labels.admin}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={onCreateServer} size="sm" variant="outline">
          <Plus className="h-3.5 w-3.5" />
          {labels.create}
        </Button>
        <Button
          disabled={!server}
          onClick={() => server && onEditServer(server)}
          size="sm"
          variant="outline"
        >
          <Pencil className="h-3.5 w-3.5" />
          {labels.edit}
        </Button>
        <Button
          disabled={!server}
          onClick={() => onResetWorld('reseed')}
          size="sm"
          variant="outline"
        >
          <RefreshCcw className="h-3.5 w-3.5" />
          {labels.reseed}
        </Button>
        <Button
          disabled={!server}
          onClick={() => onResetWorld('clear')}
          size="sm"
          variant="outline"
        >
          <Eraser className="h-3.5 w-3.5" />
          {labels.clear}
        </Button>
        <Button
          disabled={!server}
          onClick={() => server && onDeleteServer(server)}
          size="sm"
          variant="outline"
        >
          <Trash2 className="h-3.5 w-3.5 text-dynamic-red" />
          {labels.delete}
        </Button>
      </div>
    </div>
  );
}
