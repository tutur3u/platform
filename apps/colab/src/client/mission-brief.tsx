import { CircleCheck, ShieldCheck } from '@tuturuuu/icons';
import type { RoomView } from '@tuturuuu/multiplayer';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { useCopy } from './i18n';

export function MissionBrief({ room }: { room: RoomView }) {
  const c = useCopy();
  return (
    <Card id="mission" className="gap-5 shadow-none">
      <CardHeader className="gap-2">
        <CardDescription>{c.studio.overview}</CardDescription>
        <CardTitle className="text-xl">{room.scenario.title}</CardTitle>
        <CardDescription className="max-w-3xl text-sm leading-relaxed">
          {room.scenario.brief}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
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
        <Alert>
          <ShieldCheck />
          <AlertTitle>{c.sandbox}</AlertTitle>
          <AlertDescription>{c.sandboxHelp}</AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
