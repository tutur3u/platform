import type { RoomView, Team } from '@tuturuuu/multiplayer';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { Label } from '@tuturuuu/ui/label';
import { type FormEvent, useState } from 'react';
import { useCopy } from './i18n';
import { LimitFields } from './limit-fields';
import { SelectField } from './select-field';

function meter(used: number, limit: number) {
  return Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
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
      <span className="usage-remaining">
        {Math.max(limit - used, 0)} {c.remaining}
      </span>
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
    <div className="limits-panel">
      <div className="panel-heading">
        <div>
          <h3>{c.usageLimits}</h3>
          <p>{c.usageLimitsHelp}</p>
        </div>
      </div>
      <Card className="limit-scope-card gap-5 p-5 shadow-none">
        <div className="limit-scope-heading">
          <div>
            <Badge variant="outline">{c.roomBudget}</Badge>
            <h4>{c.workshopCapacity}</h4>
          </div>
          <Usage used={room.aiCalls} limit={room.limits.aiCallLimit} />
        </div>
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
      </Card>
      {team && (
        <Card className="limit-scope-card team-limit-card gap-5 p-5 shadow-none">
          <div className="limit-scope-heading">
            <Label>
              <span>{c.teamBudget}</span>
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
          </div>
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
        </Card>
      )}
    </div>
  );
}
