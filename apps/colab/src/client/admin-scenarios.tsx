import { Sparkles } from '@tuturuuu/icons';
import type { RoomView } from '@tuturuuu/multiplayer';
import { Button } from '@tuturuuu/ui/button';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useCopy } from './i18n';
import { SelectField } from './select-field';

export function AdminScenarios({
  room,
  action,
  busy,
}: {
  room: RoomView;
  action: (body: Record<string, unknown>, route?: string) => Promise<void>;
  busy: boolean;
}) {
  const c = useCopy();
  return (
    <div className="admin-tab-content">
      <div className="admin-tab-heading">
        <div>
          <h3>{c.scenarioStudio}</h3>
          <p>{c.scenarioStudioHelp}</p>
        </div>
        <Sparkles className="size-5 text-muted-foreground" aria-hidden="true" />
      </div>
      <Label>
        {c.scenarioLibrary}
        <SelectField
          label={c.scenarioLibrary}
          value={room.scenarios.findIndex(
            (item) => item.title === room.scenario.title
          )}
          disabled={busy}
          onValueChange={(value) =>
            void action({
              action: 'selectScenario',
              index: Number(value),
            }).catch(() => {})
          }
        >
          {room.scenarios.map((scenario, index) => (
            <option key={`${scenario.title}-${index}`} value={index}>
              {scenario.title}
            </option>
          ))}
        </SelectField>
      </Label>
      <div className="rounded-xl border bg-muted/20 p-4">
        <p className="font-medium text-sm">{room.scenario.title}</p>
        <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
          {room.scenario.brief}
        </p>
      </div>
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void action(
            {
              action: 'scenario',
              steering: new FormData(event.currentTarget).get('steering'),
            },
            'ai'
          ).catch(() => {});
        }}
      >
        <Label htmlFor="steering">{c.steer}</Label>
        <Textarea
          id="steering"
          name="steering"
          maxLength={2000}
          placeholder={c.steerPlaceholder}
        />
        <Button type="submit" disabled={busy} className="sm:justify-self-start">
          <Sparkles className="size-4" aria-hidden="true" />
          {busy ? c.working : c.newScenario}
        </Button>
      </form>
    </div>
  );
}
