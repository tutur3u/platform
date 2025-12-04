'use client';

import { Users } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import Image from 'next/image';
import type { WorkspaceMembersVisualization } from '../../types/visualizations';

interface MembersCardProps {
  data: WorkspaceMembersVisualization['data'];
}

export function MembersCard({ data }: MembersCardProps) {
  const { title, members, totalCount } = data;

  return (
    <Card className="overflow-hidden border-border/50 bg-linear-to-b from-card to-card/95 shadow-xl backdrop-blur-md">
      {/* Header */}
      <div className="border-border/30 border-b bg-dynamic-purple/10 px-4 py-3 pr-12">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-dynamic-purple/20">
            <Users className="h-4 w-4 text-dynamic-purple" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-sm">{title}</h3>
          </div>
          <Badge variant="secondary" className="font-semibold">
            {totalCount}
          </Badge>
        </div>
      </div>

      {/* Members List */}
      <div className="max-h-72 divide-y divide-border/20 overflow-y-auto">
        {members.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-muted-foreground">
            <Users className="h-8 w-8 text-dynamic-purple/50" />
            <span className="text-sm">No members found</span>
          </div>
        ) : (
          members.map((member) => (
            <div
              key={member.id}
              className={cn(
                'group flex items-center gap-3 px-4 py-3 transition-all duration-200',
                'hover:bg-muted/40'
              )}
            >
              {/* Avatar */}
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-dynamic-purple/20 font-medium text-dynamic-purple text-xs">
                {member.avatarUrl ? (
                  <Image
                    src={member.avatarUrl}
                    alt={member.name || 'Member Avatar'}
                    className="h-full w-full rounded-full object-cover"
                    width={32}
                    height={32}
                  />
                ) : (
                  member.name.charAt(0).toUpperCase()
                )}
              </div>

              {/* Name */}
              <span className="flex-1 truncate text-sm">{member.name}</span>

              {/* Pending badge */}
              {member.isPending && (
                <span className="rounded bg-dynamic-amber/20 px-1.5 py-0.5 text-[10px] text-dynamic-amber">
                  Invited
                </span>
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {totalCount > members.length && (
        <div className="border-border/30 border-t bg-muted/20 px-4 py-2 text-center">
          <span className="text-muted-foreground text-xs">
            +{totalCount - members.length} more members
          </span>
        </div>
      )}
    </Card>
  );
}
