import type { RoomView, Team, TeamLimits } from '@tuturuuu/multiplayer';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { type FormEvent, useState } from 'react';
import { useCopy } from './i18n';
import { SelectField } from './select-field';

function meter(used: number, limit: number) {
  return Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
}

function LimitFields({
  limits,
  maximum,
}: {
  limits: TeamLimits;
  maximum?: TeamLimits;
}) {
  const c = useCopy();
  return (
    <div className="limit-fields">
      <Label>
        {c.aiOperations}
        <Input
          name="aiCallLimit"
          type="number"
          min={1}
          max={maximum?.aiCallLimit ?? 2000}
          defaultValue={limits.aiCallLimit}
          placeholder="50"
          required
        />
      </Label>
      <Label>
        {c.agentTurns}
        <Input
          name="agentTurnLimit"
          type="number"
          min={1}
          max={maximum?.agentTurnLimit ?? 20}
          defaultValue={limits.agentTurnLimit}
          placeholder="6"
          required
        />
      </Label>
      <Label>
        {c.toolCalls}
        <Input
          name="toolCallLimit"
          type="number"
          min={0}
          max={maximum?.toolCallLimit ?? 20}
          defaultValue={limits.toolCallLimit}
          placeholder="5"
          required
        />
      </Label>
    </div>
  );
}

function Usage({ used, limit }: { used: number; limit: number }) {
  const c = useCopy();
  return (
    <div className="usage-meter">
      <div>
        <span>{c.budgetUsed}</span>
        <strong>
          {used} / {limit}
        </strong>
      </div>
      <div className="usage-track" aria-hidden="true">
        <span style={{ width: `${meter(used, limit)}%` }} />
      </div>
    </div>
  );
}

export function LimitsPanel({
  room,
  busy,
  action,
}: {
  room: RoomView;
  busy: boolean;
  action: (body: Record<string, unknown>) => Promise<void>;
}) {
  const c = useCopy();
  const [teamId, setTeamId] = useState(room.teams[0]?.id ?? '');
  const team = room.teams.find((item) => item.id === teamId) ?? room.teams[0];
  const submit = (
    event: FormEvent<HTMLFormElement>,
    scope: 'room' | 'team',
    selectedTeam?: Team
  ) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void action({
      action: 'limits',
      scope,
      teamId: selectedTeam?.id,
      aiCallLimit: Number(data.get('aiCallLimit')),
      agentTurnLimit: Number(data.get('agentTurnLimit')),
      toolCallLimit: Number(data.get('toolCallLimit')),
    }).catch(() => {});
  };
  return (
    <Card className="limits-panel gap-5 border-dashed p-4 shadow-none">
      <div className="panel-heading">
        <div>
          <h3>{c.usageLimits}</h3>
          <p>{c.usageLimitsHelp}</p>
        </div>
        <Badge variant="outline">{c.roomBudget}</Badge>
      </div>
      <Usage used={room.aiCalls} limit={room.limits.aiCallLimit} />
      <form
        key={`room-${JSON.stringify(room.limits)}`}
        className="limit-form"
        onSubmit={(event) => submit(event, 'room')}
      >
        <LimitFields limits={room.limits} />
        <p className="fine-print">{c.roomLimitsHelp}</p>
        <Button type="submit" size="sm" disabled={busy}>
          {c.saveRoomLimits}
        </Button>
      </form>
      {team && (
        <div className="team-limit-card">
          <Label>
            {c.teamBudget}
            <SelectField
              label={c.teamBudget}
              value={team.id}
              onValueChange={setTeamId}
            >
              {room.teams.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </SelectField>
          </Label>
          <Usage used={team.aiCalls} limit={team.limits.aiCallLimit} />
          <form
            key={`${team.id}-${JSON.stringify(team.limits)}`}
            className="limit-form"
            onSubmit={(event) => submit(event, 'team', team)}
          >
            <LimitFields limits={team.limits} maximum={room.limits} />
            <p className="fine-print">{c.teamLimitsHelp}</p>
            <Button type="submit" size="sm" disabled={busy}>
              {c.saveTeamLimits}
            </Button>
          </form>
        </div>
      )}
    </Card>
  );
}
