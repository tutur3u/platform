import type { RoomView } from '@tuturuuu/multiplayer';
import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import { useState } from 'react';
import { useCopy } from './i18n';

export function ActivityLog({ room }: { room: RoomView }) {
  const { studio: c } = useCopy();
  const [search, setSearch] = useState('');
  const label = (action: string) =>
    c.actions[action as keyof typeof c.actions] ?? action;
  const entries = [...(room.audit ?? [])]
    .reverse()
    .filter((entry) =>
      `${entry.actor} ${label(entry.action)}`
        .toLowerCase()
        .includes(search.toLowerCase())
    );
  return (
    <Card className="gap-4 p-5 shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-base">{c.audit}</h2>
        <Input
          className="h-8 max-w-xs"
          aria-label={c.audit}
          placeholder={c.everyone}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <p className="text-muted-foreground text-xs">{c.auditHelp}</p>
      <ol className="divide-y">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
          >
            <div className="min-w-0">
              <span className="font-medium">{entry.actor}</span>
              <span className="ml-2 text-muted-foreground">
                {label(entry.action)}
              </span>
              {entry.teamId && (
                <Badge variant="outline" className="ml-2">
                  {room.teams.find((team) => team.id === entry.teamId)?.name ??
                    entry.teamId}
                </Badge>
              )}
              {entry.adminOnly && (
                <Badge variant="secondary" className="ml-2">
                  {c.host}
                </Badge>
              )}
            </div>
            <time
              className="text-muted-foreground text-xs tabular-nums"
              dateTime={new Date(entry.at).toISOString()}
            >
              {new Date(entry.at).toLocaleString()}
            </time>
          </li>
        ))}
      </ol>
      {!entries.length && (
        <p className="py-8 text-center text-muted-foreground text-sm">
          {c.auditEmpty}
        </p>
      )}
    </Card>
  );
}
