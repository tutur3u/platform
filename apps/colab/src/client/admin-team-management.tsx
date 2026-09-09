import { ShieldCheck, Trash2, UserPlus, Users } from '@tuturuuu/icons';
import {
  type Member,
  type RoomView,
  staff,
  type Team,
} from '@tuturuuu/multiplayer';
import { Avatar, AvatarFallback } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useState } from 'react';
import { useCopy } from './i18n';
import { SelectField } from './select-field';

type Action = (body: Record<string, unknown>, route?: string) => Promise<void>;

function MemberRow({
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
          label={c.assign}
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

function TeamCard({
  team,
  memberCount,
  busy,
  canDelete,
  action,
  onDelete,
}: {
  team: Team;
  memberCount: number;
  busy: boolean;
  canDelete: boolean;
  action: Action;
  onDelete: (team: Team) => void;
}) {
  const c = useCopy();
  const [name, setName] = useState(team.name);
  return (
    <div className="team-management-card">
      <div className="flex items-center gap-3">
        <span className="team-icon">
          <Users className="size-4" aria-hidden="true" />
        </span>
        <div>
          <strong className="text-sm">{team.name}</strong>
          <p className="text-muted-foreground text-xs">
            {memberCount}{' '}
            {memberCount === 1
              ? c.studio.participant.toLowerCase()
              : c.members.toLowerCase()}
          </p>
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`team-name-${team.id}`}>{c.teamName}</Label>
        <div className="flex gap-2">
          <Input
            id={`team-name-${team.id}`}
            name={`team-name-${team.id}`}
            autoComplete="off"
            value={name}
            maxLength={60}
            placeholder={c.teamNamePlaceholder}
            onChange={(event) => setName(event.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            disabled={busy || !name.trim() || name.trim() === team.name}
            onClick={() =>
              void action({
                action: 'teamRename',
                teamId: team.id,
                name,
              }).catch(() => {})
            }
          >
            {c.rename}
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap justify-between gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() =>
            void action({ action: 'reset', teamId: team.id }).catch(() => {})
          }
        >
          {c.reset}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          disabled={busy || !canDelete}
          onClick={() => onDelete(team)}
        >
          <Trash2 className="size-4" aria-hidden="true" />
          {c.deleteTeam}
        </Button>
      </div>
    </div>
  );
}

export function AdminTeamManagement({
  room,
  action,
  busy,
}: {
  room: RoomView;
  action: Action;
  busy: boolean;
}) {
  const c = useCopy();
  const [newTeam, setNewTeam] = useState('');
  const [removeMember, setRemoveMember] = useState<Member | null>(null);
  const [removeTeam, setRemoveTeam] = useState<Team | null>(null);
  return (
    <div className="admin-tab-content">
      <div className="admin-tab-heading">
        <div>
          <h3>{c.teamManagement}</h3>
          <p>{c.teamManagementHelp}</p>
        </div>
        <Badge variant="secondary">
          {room.members.length}/{room.maxUsers} {c.members.toLowerCase()}
        </Badge>
      </div>
      <Tabs defaultValue="people" className="space-y-5">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="people">{c.peopleTab}</TabsTrigger>
          <TabsTrigger value="teams">{c.departmentsTab}</TabsTrigger>
        </TabsList>
        <TabsContent value="people" className="mt-0 space-y-3">
          {room.members.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              room={room}
              action={action}
              busy={busy}
              onRemove={setRemoveMember}
            />
          ))}
        </TabsContent>
        <TabsContent value="teams" className="mt-0 space-y-5">
          <form
            className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              void action({ action: 'teamCreate', name: newTeam })
                .then(() => setNewTeam(''))
                .catch(() => {});
            }}
          >
            <Label className="min-w-0 flex-1">
              {c.newTeam}
              <Input
                name="new-team-name"
                autoComplete="off"
                value={newTeam}
                maxLength={60}
                placeholder={c.teamNamePlaceholder}
                onChange={(event) => setNewTeam(event.target.value)}
              />
            </Label>
            <Button
              disabled={busy || !newTeam.trim() || room.teams.length >= 12}
            >
              <UserPlus className="size-4" aria-hidden="true" />
              {c.addTeam}
            </Button>
          </form>
          <div className="team-management-grid">
            {room.teams.map((team) => (
              <TeamCard
                key={`${team.id}:${team.name}`}
                team={team}
                memberCount={
                  room.members.filter((m) => m.teamId === team.id).length
                }
                busy={busy}
                canDelete={room.teams.length > 1}
                action={action}
                onDelete={setRemoveTeam}
              />
            ))}
          </div>
        </TabsContent>
      </Tabs>
      <Dialog
        open={Boolean(removeMember)}
        onOpenChange={() => setRemoveMember(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{c.removeMember}</DialogTitle>
            <DialogDescription>{c.removeMemberHelp}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{c.cancel}</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                if (removeMember)
                  void action({
                    action: 'memberRemove',
                    memberId: removeMember.id,
                  });
                setRemoveMember(null);
              }}
            >
              {c.removeMember}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(removeTeam)}
        onOpenChange={() => setRemoveTeam(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{c.deleteTeam}</DialogTitle>
            <DialogDescription>{c.deleteTeamHelp}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{c.cancel}</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                if (removeTeam)
                  void action({ action: 'teamDelete', teamId: removeTeam.id });
                setRemoveTeam(null);
              }}
            >
              {c.deleteTeam}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
