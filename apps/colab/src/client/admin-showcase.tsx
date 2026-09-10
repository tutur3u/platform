import { ArrowRight, Play, Presentation, Users } from '@tuturuuu/icons';
import type { RoomView } from '@tuturuuu/multiplayer';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Switch } from '@tuturuuu/ui/switch';
import { useCopy } from './i18n';

type Action = (body: Record<string, unknown>, route?: string) => Promise<void>;

export function AdminShowcase({
  room,
  action,
  busy,
}: {
  room: RoomView;
  action: Action;
  busy: boolean;
}) {
  const c = useCopy();
  const activeIndex = Math.max(
    0,
    room.teams.findIndex((team) => team.id === room.showcaseTeamId)
  );
  const activeTeam = room.teams[activeIndex] ?? room.teams[0];
  const nextTeam = room.teams[(activeIndex + 1) % room.teams.length];
  const present = async (teamId: string) => {
    if (!room.showcase) await action({ action: 'showcase', enabled: true });
    await action({ action: 'showcaseTeam', teamId });
  };
  return (
    <div className="admin-tab-content">
      <div className="admin-tab-heading">
        <div>
          <h3>{c.showcaseControl}</h3>
          <p>{c.showcaseControlHelp}</p>
        </div>
        <Presentation className="size-5 text-muted-foreground" aria-hidden />
      </div>
      <div className="showcase-switch-row">
        <div>
          <strong>{c.liveShowcase}</strong>
          <p>{room.showcase ? c.showcaseAudienceOn : c.showcaseAudienceOff}</p>
        </div>
        <Switch
          checked={room.showcase}
          disabled={busy}
          aria-label={c.liveShowcase}
          onCheckedChange={(enabled) =>
            void action({ action: 'showcase', enabled }).catch(() => {})
          }
        />
      </div>
      {activeTeam && (
        <section className="showcase-now-card" aria-live="polite">
          <div className="showcase-now-icon">
            <Presentation className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <span>{c.nowShowcasing}</span>
            <h4>{activeTeam.name}</h4>
            <p>
              {activeTeam.skills.length} {c.skills.toLowerCase()} ·{' '}
              {activeTeam.runs.length} {c.practiceRuns.toLowerCase()}
            </p>
          </div>
          {room.showcase && nextTeam && (
            <Button
              type="button"
              disabled={busy}
              onClick={() => void present(nextTeam.id).catch(() => {})}
            >
              {c.nextTeam}
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          )}
        </section>
      )}
      <div className="showcase-team-list">
        {room.teams.map((team, index) => {
          const active = team.id === activeTeam?.id;
          return (
            <div className="showcase-team-row" key={team.id}>
              <span className="showcase-order">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{team.name}</strong>
                  {active && <Badge variant="secondary">{c.onStage}</Badge>}
                </div>
                <p>
                  <Users className="size-3.5" aria-hidden />
                  {
                    room.members.filter((member) =>
                      member.teamIds.includes(team.id)
                    ).length
                  }{' '}
                  {c.members.toLowerCase()} ·{' '}
                  {team.prompt ? c.systemReady : c.systemMissing}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant={active ? 'secondary' : 'outline'}
                disabled={busy || active}
                onClick={() => void present(team.id).catch(() => {})}
              >
                <Play className="size-3.5" aria-hidden />
                {active ? c.presenting : c.presentTeam}
              </Button>
            </div>
          );
        })}
      </div>
      <p className="fine-print">{c.showcasePrivacyHelp}</p>
    </div>
  );
}
