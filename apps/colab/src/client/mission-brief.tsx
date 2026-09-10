import { CircleCheck } from '@tuturuuu/icons';
import type { RoomView } from '@tuturuuu/multiplayer';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { useCopy } from './i18n';
import { SourceMap } from './learning';
import { WorkspaceLink } from './navigation';

export function MissionBrief({ room }: { room: RoomView }) {
  const c = useCopy();
  return (
    <Card id="mission" className="gap-5 shadow-none">
      <CardHeader className="gap-2">
        <CardDescription>{c.studio.overview}</CardDescription>
        <CardTitle className="text-xl">
          <h2>{room.scenario.title}</h2>
        </CardTitle>
        <CardDescription className="max-w-3xl text-sm leading-relaxed">
          {room.scenario.brief}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {room.scenario.id === 'rise-induction-post' && (
          <section className="space-y-5">
            <h3 className="font-semibold">{c.learning.missionTitle}</h3>
            <p className="text-sm leading-relaxed">{c.learning.missionHelp}</p>
            <div className="mission-deliverables">
              {c.learning.deliverables.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
            <SourceMap />
            <p className="notice">{c.learning.rehearsal}</p>
          </section>
        )}
        <section className="space-y-3" aria-label={c.criteria}>
          <h3 className="font-medium text-sm">{c.criteria}</h3>
          <ul className="grid gap-2">
            {room.scenario.criteria.map((item) => (
              <li
                key={item}
                className="flex items-start gap-3 rounded-lg bg-muted/40 px-3 py-2.5 text-sm"
              >
                <CircleCheck
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </section>
        <div className="mission-next-step">
          <span>{c.nextStep}</span>
          <p>{c.nextStepHelp}</p>
          <div className="action-row mt-4">
            <Button asChild>
              <WorkspaceLink href="#learning">{c.learning.title}</WorkspaceLink>
            </Button>
            <Button asChild variant="outline">
              <WorkspaceLink href="#team-prompt">
                {c.learning.openPrompt}
              </WorkspaceLink>
            </Button>
            <Button asChild variant="outline">
              <WorkspaceLink href="#sandbox-desk">
                {c.learning.openSources}
              </WorkspaceLink>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
