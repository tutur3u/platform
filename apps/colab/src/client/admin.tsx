import {
  CalendarClock,
  Gauge,
  LayoutDashboard,
  Lock,
  Sparkles,
  Trash2,
  Users,
} from '@tuturuuu/icons';
import type { RoomView } from '@tuturuuu/multiplayer';
import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import { Progress } from '@tuturuuu/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { AdminAccess } from './admin-access';
import { AdminDangerZone } from './admin-danger-zone';
import { AdminScenarios } from './admin-scenarios';
import { AdminSchedule } from './admin-schedule';
import { AdminTeamManagement } from './admin-team-management';
import { useCopy } from './i18n';
import { LimitsPanel } from './limits-panel';

export function Admin({
  room,
  action,
  busy,
  onDelete,
}: {
  room: RoomView;
  action: (body: Record<string, unknown>, route?: string) => Promise<void>;
  busy: boolean;
  onDelete: () => Promise<void>;
}) {
  const c = useCopy();
  const usage = Math.min(100, (room.aiCalls / room.limits.aiCallLimit) * 100);
  return (
    <Card className="admin-command-center gap-0 overflow-hidden shadow-none">
      <header className="admin-command-header">
        <div>
          <span className="section-number">{c.hostControls}</span>
          <h2>{c.facilitator}</h2>
          <p>{c.adminHelp}</p>
        </div>
        <Badge variant="secondary">{c.ownerWorkspace}</Badge>
      </header>
      <Tabs
        defaultValue="overview"
        orientation="vertical"
        className="admin-tabs !grid gap-0"
      >
        <TabsList className="admin-tabs-list !h-full !w-full !justify-start max-[900px]:!h-auto">
          <TabsTrigger value="overview">
            <LayoutDashboard className="size-4" aria-hidden="true" />
            {c.overviewTab}
          </TabsTrigger>
          <TabsTrigger value="teams">
            <Users className="size-4" aria-hidden="true" />
            {c.teamTab}
          </TabsTrigger>
          <TabsTrigger value="schedule">
            <CalendarClock className="size-4" aria-hidden="true" />
            {c.scheduleTab}
          </TabsTrigger>
          <TabsTrigger value="access">
            <Lock className="size-4" aria-hidden="true" />
            {c.accessTab}
          </TabsTrigger>
          <TabsTrigger value="scenarios">
            <Sparkles className="size-4" aria-hidden="true" />
            {c.scenariosTab}
          </TabsTrigger>
          <TabsTrigger value="limits">
            <Gauge className="size-4" aria-hidden="true" />
            {c.limitsTab}
          </TabsTrigger>
          <TabsTrigger value="danger">
            <Trash2 className="size-4" aria-hidden="true" />
            {c.dangerTab}
          </TabsTrigger>
        </TabsList>
        <div className="min-w-0">
          <TabsContent value="overview" className="mt-0">
            <div className="admin-tab-content">
              <div className="admin-tab-heading">
                <div>
                  <h3>{c.workshopAtGlance}</h3>
                  <p>{c.workshopAtGlanceHelp}</p>
                </div>
              </div>
              <div className="admin-stat-grid">
                <div>
                  <span>{c.members}</span>
                  <strong>
                    {room.members.length}/{room.maxUsers}
                  </strong>
                </div>
                <div>
                  <span>{c.departmentsTab}</span>
                  <strong>{room.teams.length}</strong>
                </div>
                <div>
                  <span>{c.roomMode}</span>
                  <strong>{c[room.mode]}</strong>
                </div>
                <div>
                  <span>{c.scenarioLibrary}</span>
                  <strong>{room.scenarios.length}</strong>
                </div>
              </div>
              <section className="admin-subsection">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span>{c.roomBudget}</span>
                  <strong>
                    {room.aiCalls}/{room.limits.aiCallLimit}
                  </strong>
                </div>
                <Progress value={usage} />
                <p className="fine-print">{c.overviewNextStep}</p>
              </section>
            </div>
          </TabsContent>
          <TabsContent value="teams" className="mt-0">
            <AdminTeamManagement room={room} action={action} busy={busy} />
          </TabsContent>
          <TabsContent value="schedule" className="mt-0">
            <AdminSchedule
              key={`${room.startsAt}:${room.endsAt}`}
              room={room}
              action={action}
              busy={busy}
            />
          </TabsContent>
          <TabsContent value="access" className="mt-0">
            <AdminAccess room={room} action={action} busy={busy} />
          </TabsContent>
          <TabsContent value="scenarios" className="mt-0">
            <AdminScenarios room={room} action={action} busy={busy} />
          </TabsContent>
          <TabsContent value="limits" className="mt-0">
            <div className="admin-tab-content">
              <div className="admin-tab-heading">
                <div>
                  <h3>{c.usageLimits}</h3>
                  <p>{c.usageLimitsHelp}</p>
                </div>
              </div>
              <LimitsPanel room={room} action={action} busy={busy} />
            </div>
          </TabsContent>
          <TabsContent value="danger" className="mt-0">
            <AdminDangerZone
              isOwner={room.self.id === room.ownerId}
              busy={busy}
              onDelete={onDelete}
            />
          </TabsContent>
        </div>
      </Tabs>
    </Card>
  );
}
