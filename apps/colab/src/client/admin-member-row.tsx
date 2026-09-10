import { ChevronsUpDown, ShieldCheck, Trash2, Users } from '@tuturuuu/icons';
import {
  type Member,
  memberTeamIds,
  type RoomView,
  staff,
} from '@tuturuuu/multiplayer';
import { Avatar, AvatarFallback } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useCopy } from './i18n';
import { SelectField } from './select-field';

type Action = (body: Record<string, unknown>, route?: string) => Promise<void>;

export function AdminMemberRow({
  member,
  room,
  busy,
  action,
  onRemove,
}: {
  member: Member;
  room: RoomView;
  busy: boolean;
  action: Action;
  onRemove: (member: Member) => void;
}) {
  const c = useCopy();
  const owner = member.id === room.ownerId;
  const memberships = memberTeamIds(member);
  return (
    <div className="member-card">
      <Avatar className="size-10 border">
        <AvatarFallback>{member.name.slice(0, 1).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="truncate text-sm">{member.name}</strong>
          {owner && <Badge variant="secondary">{c.owner}</Badge>}
          {member.admin && !owner && <Badge variant="outline">{c.admin}</Badge>}
        </div>
        <p className="truncate text-muted-foreground text-xs">
          {member.email ?? c.guestAccount}
        </p>
      </div>
      <div className="member-actions">
        <SelectField
          label={c.primaryTeam}
          value={member.teamId}
          disabled={busy}
          onValueChange={(teamId) =>
            void action({
              action: 'assign',
              memberId: member.id,
              teamId,
            }).catch(() => {})
          }
        >
          {room.teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </SelectField>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" disabled={busy}>
              <Users className="size-4" aria-hidden="true" />
              {c.teamMemberships} ({memberships.length})
              <ChevronsUpDown className="size-3.5" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-64">
            <DropdownMenuLabel>{c.teamMembershipsHelp}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {room.teams.map((team) => {
              const checked = memberships.includes(team.id);
              return (
                <DropdownMenuCheckboxItem
                  key={team.id}
                  checked={checked}
                  disabled={busy || (checked && memberships.length === 1)}
                  onCheckedChange={(enabled) =>
                    void action({
                      action: 'membership',
                      memberId: member.id,
                      teamId: team.id,
                      enabled: enabled === true,
                    }).catch(() => {})
                  }
                >
                  {team.name}
                  {member.teamId === team.id && (
                    <Badge variant="secondary" className="ml-auto">
                      {c.primaryTeam}
                    </Badge>
                  )}
                </DropdownMenuCheckboxItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        {staff(room.self) && member.email && !owner && (
          <Button
            type="button"
            size="sm"
            variant={member.admin ? 'secondary' : 'outline'}
            disabled={busy}
            onClick={() =>
              void action({
                action: 'admin',
                memberId: member.id,
                enabled: !member.admin,
              }).catch(() => {})
            }
          >
            <ShieldCheck className="size-4" aria-hidden="true" />
            {member.admin ? c.removeAdmin : c.makeAdmin}
          </Button>
        )}
        {!owner && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={`${c.removeMember}: ${member.name}`}
            disabled={busy}
            onClick={() => onRemove(member)}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}
