import {
  ArrowRight,
  BookOpen,
  FileText,
  Presentation,
  Rocket,
  Sparkles,
} from '@tuturuuu/icons';
import { memberTeamIds, type RoomView } from '@tuturuuu/multiplayer';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { useCopy } from './i18n';
import { RunReport } from './run-report';

export function ShowcaseStage({
  room,
  busy,
  roomWritable,
  onPresent,
  onRun,
}: {
  room: RoomView;
  busy: boolean;
  roomWritable: boolean;
  onPresent: (teamId: string) => Promise<void>;
  onRun: (teamId: string) => Promise<void>;
}) {
  const c = useCopy();
  const stageIndex = room.teams.findIndex(
    (team) => team.id === room.showcaseTeamId
  );
  const stageTeam = room.teams[stageIndex] ?? room.teams[0];
  const nextTeam =
    room.teams[(Math.max(stageIndex, 0) + 1) % room.teams.length];

  if (!room.showcase || !stageTeam) {
    return (
      <Card className="showcase-empty studio-panel shadow-none">
        <span className="showcase-empty-icon">
          <Presentation className="size-5" aria-hidden />
        </span>
        <div>
          <h2 className="showcase-panel-title">{c.showcaseWaitingTitle}</h2>
          <p>{c.showcaseWaitingHelp}</p>
        </div>
      </Card>
    );
  }

  const latestRun = stageTeam.runs.at(-1);
  const canTest =
    room.self.admin || memberTeamIds(room.self).includes(stageTeam.id);
  const budgetAvailable =
    room.aiCalls < room.limits.aiCallLimit &&
    stageTeam.aiCalls < stageTeam.limits.aiCallLimit;
  const readyToTest =
    roomWritable &&
    canTest &&
    budgetAvailable &&
    stageTeam.prompt.length >= 10 &&
    stageTeam.skills.length > 0;

  return (
    <div className="showcase-workspace">
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
            {canTest && (
              <Button
                type="button"
                variant="outline"
                disabled={busy || !readyToTest}
                onClick={() => void onRun(stageTeam.id).catch(() => {})}
              >
                <Rocket className="size-4" aria-hidden />
                {busy ? c.working : c.testLive}
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

      <div className="showcase-context-grid">
        <Card className="showcase-context-card shadow-none">
          <div className="showcase-card-heading">
            <BookOpen className="size-4" aria-hidden />
            <h3 className="showcase-panel-title">{c.showcaseChallenge}</h3>
          </div>
          <strong>{room.scenario.title}</strong>
          <p>{room.scenario.brief}</p>
        </Card>
        <Card className="showcase-context-card shadow-none">
          <div className="showcase-card-heading">
            <Sparkles className="size-4" aria-hidden />
            <h3 className="showcase-panel-title">{c.showcaseSystem}</h3>
          </div>
          <pre className="showcase-prompt">
            {stageTeam.prompt || c.emptyPrompt}
          </pre>
        </Card>
      </div>

      <Card className="showcase-section shadow-none">
        <div className="showcase-section-heading">
          <div>
            <span className="section-number">{c.showcaseSkillsLabel}</span>
            <h2 className="showcase-panel-title">{c.showcaseSkills}</h2>
          </div>
          <Badge variant="outline">
            <FileText className="size-3.5" aria-hidden />
            {stageTeam.skills.length}
          </Badge>
        </div>
        {stageTeam.skills.length ? (
          <div className="showcase-skill-grid">
            {stageTeam.skills.map((skill) => (
              <article className="showcase-skill-card" key={skill.name}>
                <strong>{skill.name}</strong>
                <p>{skill.description}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty">{c.showcaseNoSkills}</p>
        )}
        {canTest && !readyToTest && (
          <p className="fine-print">{c.showcaseTestHelp}</p>
        )}
      </Card>

      <Card className="showcase-section shadow-none">
        <div className="showcase-section-heading">
          <div>
            <span className="section-number">{c.showcaseResultLabel}</span>
            <h2 className="showcase-panel-title">{c.showcaseResult}</h2>
          </div>
          {latestRun && <Badge variant="secondary">{c.latest}</Badge>}
        </div>
        {latestRun ? (
          <RunReport
            isLatest
            limits={stageTeam.limits}
            run={latestRun}
            number={stageTeam.runs.length}
          />
        ) : (
          <p className="empty">{c.showcaseNoRun}</p>
        )}
      </Card>
    </div>
  );
}
