import { maximumWorkshopLimits, type TeamLimits } from '@tuturuuu/multiplayer';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useState } from 'react';
import { useCopy } from './i18n';

const presets = [
  { id: 'guided', turns: 8, tools: 6 },
  { id: 'extended', turns: 16, tools: 12 },
  { id: 'deep', turns: 60, tools: 50 },
] as const;

export function LimitFields({
  limits,
  maximum = maximumWorkshopLimits,
}: {
  limits: TeamLimits;
  maximum?: TeamLimits;
}) {
  const c = useCopy();
  const [aiCalls, setAiCalls] = useState(limits.aiCallLimit);
  const [turns, setTurns] = useState(limits.agentTurnLimit);
  const [tools, setTools] = useState(limits.toolCallLimit);
  const toolMaximum = Math.min(Math.max(turns - 1, 0), maximum.toolCallLimit);
  const effectivePresets = presets
    .map((preset) => {
      const presetTurns = Math.min(preset.turns, maximum.agentTurnLimit);
      return {
        ...preset,
        effectiveTurns: presetTurns,
        effectiveTools: Math.min(
          preset.tools,
          maximum.toolCallLimit,
          presetTurns - 1
        ),
      };
    })
    .filter(
      (preset, index, candidates) =>
        candidates.findIndex(
          (candidate) =>
            candidate.effectiveTurns === preset.effectiveTurns &&
            candidate.effectiveTools === preset.effectiveTools
        ) === index
    );
  const choosePreset = (nextTurns: number, nextTools: number) => {
    const boundedTurns = Math.min(nextTurns, maximum.agentTurnLimit);
    setTurns(boundedTurns);
    setTools(Math.min(nextTools, maximum.toolCallLimit, boundedTurns - 1));
  };

  return (
    <>
      <fieldset className="limit-presets">
        <legend className="sr-only">{c.runDepth}</legend>
        <div className="limit-preset-copy">
          <strong>{c.runDepth}</strong>
          <span>{c.runDepthHelp}</span>
        </div>
        <div className="limit-preset-actions">
          {effectivePresets.map((preset) => {
            return (
              <Button
                key={preset.id}
                type="button"
                size="sm"
                variant="outline"
                aria-pressed={
                  turns === preset.effectiveTurns &&
                  tools === preset.effectiveTools
                }
                onClick={() => choosePreset(preset.turns, preset.tools)}
              >
                {c[`${preset.id}Preset`]}
              </Button>
            );
          })}
        </div>
      </fieldset>
      <div className="limit-fields">
        <Label>
          <span>{c.aiOperations}</span>
          <small>{c.aiOperationsHelp}</small>
          <Input
            name="aiCallLimit"
            type="number"
            min={1}
            max={maximum.aiCallLimit}
            value={aiCalls}
            onChange={(event) => setAiCalls(Number(event.currentTarget.value))}
            placeholder="150"
            required
          />
        </Label>
        <Label>
          <span>{c.agentTurns}</span>
          <small>{c.agentTurnsHelp}</small>
          <Input
            name="agentTurnLimit"
            type="number"
            min={2}
            max={maximum.agentTurnLimit}
            value={turns}
            onChange={(event) => {
              const value = Number(event.currentTarget.value);
              setTurns(value);
              setTools((current) => Math.min(current, Math.max(value - 1, 0)));
            }}
            placeholder="60"
            required
          />
        </Label>
        <Label>
          <span>{c.toolCalls}</span>
          <small>{c.toolCallsHelp}</small>
          <Input
            name="toolCallLimit"
            type="number"
            min={0}
            max={toolMaximum}
            value={tools}
            onChange={(event) => setTools(Number(event.currentTarget.value))}
            placeholder="50"
            required
          />
        </Label>
      </div>
    </>
  );
}
