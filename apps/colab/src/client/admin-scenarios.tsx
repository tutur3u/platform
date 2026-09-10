import { Dices, Sparkles } from '@tuturuuu/icons';
import type { RoomView } from '@tuturuuu/multiplayer';
import { Button } from '@tuturuuu/ui/button';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useState } from 'react';
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
  const [steering, setSteering] = useState('');
  const generate = async (random: boolean) => {
    await action({ action: 'scenario', steering, random }, 'ai');
    if (!random) setSteering('');
  };
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
          value={room.scenario.id}
          disabled={busy}
          onValueChange={(value) =>
            void action({
              action: 'selectScenario',
              scenarioId: value,
            }).catch(() => {})
          }
        >
          {room.scenarios.map((scenario) => (
            <option key={scenario.id} value={scenario.id}>
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
          void generate(false).catch(() => {});
        }}
      >
        <Label htmlFor="steering">{c.steer}</Label>
        <Textarea
          id="steering"
          name="steering"
          maxLength={2000}
          disabled={busy}
          value={steering}
          onChange={(event) => setSteering(event.target.value)}
          placeholder={c.steerPlaceholder}
        />
        <div className="flex flex-wrap gap-2 sm:justify-self-start">
          <Button type="submit" disabled={busy || !steering.trim()}>
            <Sparkles className="size-4" aria-hidden="true" />
            {busy ? c.working : c.newScenario}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void generate(true).catch(() => {})}
          >
            <Dices className="size-4" aria-hidden="true" />
            {c.surpriseScenario}
          </Button>
        </div>
      </form>
    </div>
  );
}
