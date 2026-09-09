import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Plus, RefreshCw, Search, Users } from '@tuturuuu/icons';
import { colabRequest } from '@tuturuuu/internal-api/colab';
import type { WorkshopSummary } from '@tuturuuu/multiplayer';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useState } from 'react';
import { ErrorNotice } from './home';
import { useCopy } from './i18n';
import { WorkspaceLink } from './navigation';

export function WorkshopsPage({ canHost }: { canHost: boolean }) {
  const c = useCopy();
  const s = c.studio;
  const [tab, setTab] = useState('current');
  const [search, setSearch] = useState('');
  const recent = localStorage.getItem('colab-recent-room');
  const query = useQuery({
    queryKey: ['workshops'],
    queryFn: () => colabRequest<{ workshops: WorkshopSummary[] }>('/workshops'),
    refetchInterval: 15000,
  });
  const now = Date.now();
  const all = query.data?.workshops ?? [];
  const rooms = all
    .filter(
      (room) =>
        (tab === 'past' ? room.endsAt <= now : room.endsAt > now) &&
        room.title.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) =>
      tab === 'past' ? b.endsAt - a.endsAt : a.startsAt - b.startsAt
    );
  return (
    <div className="mx-auto max-w-6xl space-y-8 p-5 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-2xl">
          <h1 className="font-semibold text-2xl tracking-tight">
            {s.workshops}
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            {s.directoryDescription}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" asChild>
            <WorkspaceLink href="/join">
              <Users className="size-4" aria-hidden="true" />
              {c.join}
            </WorkspaceLink>
          </Button>
          {canHost && (
            <Button size="sm" asChild>
              <WorkspaceLink href="/host">
                <Plus className="size-4" aria-hidden="true" />
                {c.host}
              </WorkspaceLink>
            </Button>
          )}
        </div>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-3">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="current">
              {s.current}
              <Badge variant="secondary">
                {all.filter((r) => r.endsAt > now).length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="past">
              {s.past}
              <Badge variant="secondary">
                {all.filter((r) => r.endsAt <= now).length}
              </Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex min-w-[min(100%,18rem)] flex-1 items-center justify-end gap-2 sm:flex-none">
          <div className="relative min-w-0 flex-1 sm:w-72">
            <Search
              className="absolute top-2.5 left-3 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              className="h-9 pl-9"
              aria-label={s.search}
              placeholder={s.search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            aria-label={s.refresh}
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
      <ErrorNotice error={query.error} />
      {query.isPending ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : query.isError && !query.data ? null : rooms.length ? (
        <div className="grid gap-3">
          {rooms.map((room) => (
            <article
              key={room.id}
              className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-5 transition-colors hover:bg-muted/30"
            >
              <div className="rounded-lg border bg-muted/40 p-2.5">
                <CalendarDays
                  className="size-5 text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
              <div className="min-w-0 flex-1">
                <Button
                  variant="link"
                  className="h-auto max-w-full justify-start p-0 font-medium text-base"
                  asChild
                >
                  <WorkspaceLink
                    href={`/?room=${room.id}`}
                    onClick={() =>
                      localStorage.setItem('colab-recent-room', room.id)
                    }
                  >
                    <span className="truncate">{room.title}</span>
                  </WorkspaceLink>
                </Button>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs">
                  <span>
                    {new Date(room.startsAt).toLocaleString()} –{' '}
                    {new Date(room.endsAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <span>
                    {room.memberCount}/{room.maxUsers} {s.people} ·{' '}
                    {room.teamCount} {s.teams}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant={room.endsAt <= now ? 'secondary' : 'outline'}>
                  {room.endsAt <= now
                    ? s.ended
                    : room.mode !== 'open'
                      ? c[room.mode]
                      : room.startsAt > now
                        ? s.upcoming
                        : s.live}
                </Badge>
                <Badge variant="secondary">
                  {room.admin ? s.host : s.participant}
                </Badge>
                <Badge variant="outline">
                  {room.showcase ? s.shared : s.private}
                </Badge>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
          <CalendarDays
            className="mb-4 size-8 text-muted-foreground"
            aria-hidden="true"
          />
          <h2 className="font-medium text-base">
            {search ? s.noResults : s.empty}
          </h2>
          <p className="mt-2 max-w-sm text-muted-foreground text-sm">
            {s.emptyHelp}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button variant="outline" asChild>
              <WorkspaceLink href="/join">{c.join}</WorkspaceLink>
            </Button>
            {canHost && (
              <Button asChild>
                <WorkspaceLink href="/host">
                  <Plus className="size-4" aria-hidden="true" />
                  {c.host}
                </WorkspaceLink>
              </Button>
            )}
          </div>
        </div>
      )}
      {recent &&
        /^[a-f0-9-]{36}$/.test(recent) &&
        !all.some((room) => room.id === recent) && (
          <Button variant="outline" size="sm" asChild>
            <WorkspaceLink href={`/?room=${recent}`}>{c.recent}</WorkspaceLink>
          </Button>
        )}
      <p className="text-muted-foreground text-xs">{s.historyHelp}</p>
    </div>
  );
}
