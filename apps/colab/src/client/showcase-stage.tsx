import { ArrowRight, Presentation, Sparkles } from '@tuturuuu/icons';
import type { RoomView, Team } from '@tuturuuu/multiplayer';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { useCopy } from './i18n';

export function ShowcaseStage({
  room,
  selectedTeam,
  busy,
  onPresent,
  onSelect,
}: {
  room: RoomView;
  selectedTeam: Team | undefined;
  busy: boolean;
  onPresent: (teamId: string) => Promise<void>;
  onSelect: (teamId: string) => void;
}) {
  const c = useCopy();
  const stageIndex = room.teams.findIndex(
    (team) => team.id === room.showcaseTeamId
  );
  const stageTeam = room.teams[stageIndex] ?? room.teams[0];
  const nextTeam =
    room.teams[(Math.max(stageIndex, 0) + 1) % room.teams.length];
  if (!room.showcase || !stageTeam) return null;
  return (
    <section className="live-showcase-banner" aria-live="polite">
      <div className="live-showcase-kicker">
        <Presentation className="size-4" aria-hidden />
        <span>{c.liveShowcase}</span>
        <Badge variant="secondary">{c.onStage}</Badge>
      </div>
      <div className="live-showcase-main">
        <div>
          <h2 className="showcase-title">{stageTeam.name}</h2>
          <p className="showcase-copy">{c.liveShowcaseHelp}</p>
        </div>
        <div className="live-showcase-actions">
          {selectedTeam?.id !== stageTeam.id && (
            <Button
              type="button"
              variant="outline"
              onClick={() => onSelect(stageTeam.id)}
            >
              <Sparkles className="size-4" aria-hidden />
              {c.openTeamSystem}
            </Button>
          )}
          {room.self.admin && nextTeam && (
            <Button
              type="button"
              disabled={busy}
              onClick={() => void onPresent(nextTeam.id).catch(() => {})}
            >
              {c.nextTeam}
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          )}
        </div>
      </div>
      <fieldset className="showcase-progress" aria-label={c.showcaseOrder}>
        {room.teams.map((team, index) => (
          <button
            type="button"
            key={team.id}
            className={`showcase-progress-step ${team.id === stageTeam.id ? 'is-active' : ''}`}
            aria-current={team.id === stageTeam.id ? 'step' : undefined}
            aria-label={`${index + 1}. ${team.name}`}
            disabled={!room.self.admin || busy}
            onClick={() => void onPresent(team.id).catch(() => {})}
          />
        ))}
      </fieldset>
    </section>
  );
}
