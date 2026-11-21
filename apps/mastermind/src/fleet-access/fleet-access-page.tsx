import type { FleetAccess } from '@tuturuuu/internal-api/fleet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import type { ReactNode } from 'react';
import { LoadingState } from '../components/page-states';
import { SectionMessage } from '../components/section';
import { PageHeader, Shell } from '../components/shell';
import { AccessTab } from './access-tab';
import { AskTab } from './ask-tab';
import { LinkIdentityTab } from './link-identity-tab';
import { type FleetTab, type LiveFleetAccess, visibleTabs } from './model';
import { useOwnerConsole } from './owner-queries';
import { RequestsTab } from './requests-tab';
import { StatusTab } from './status-tab';
import { useFleetText } from './text';
import type { FleetRead } from './upstream';

type Props = {
  access: FleetRead<FleetAccess>;
  tab: FleetTab | undefined;
  onTabChange: (tab: FleetTab) => void;
};

type Gate =
  | { kind: 'live'; access: LiveFleetAccess }
  | { kind: 'stopped' }
  | { kind: 'disabled' }
  | { kind: 'denied' };

function gateOf(access: FleetRead<FleetAccess>): Gate {
  if (access.kind === 'denied') return { kind: 'denied' };
  if (access.data.enabled) return { kind: 'live', access: access.data };
  return { kind: access.data.stopped ? 'stopped' : 'disabled' };
}

export function FleetAccessPage({ access, tab, onTabChange }: Props) {
  const { t } = useFleetText();
  const gate = gateOf(access);
  // A stop disables every tier, so only a readable console marks the Owner.
  const probe = useOwnerConsole({ enabled: gate.kind === 'stopped' });
  const stoppedOwner = gate.kind === 'stopped' && probe.data?.kind === 'ok';
  const owner =
    stoppedOwner || (gate.kind === 'live' && gate.access.tier === 'owner');
  return (
    // The Owner keeps the full navigation; everyone else sees Fleet entries.
    <Shell scope={owner ? 'owner' : 'fleet'} footer={null}>
      <PageHeader
        title={t.title}
        subtitle={
          gate.kind === 'live'
            ? t.tier[gate.access.tier]
            : stoppedOwner
              ? t.tier.owner
              : undefined
        }
      />
      {gate.kind === 'live' ? (
        <LiveTabs
          tabs={visibleTabs(gate.access)}
          access={gate.access}
          tab={tab}
          onTabChange={onTabChange}
        />
      ) : stoppedOwner ? (
        <LiveTabs tabs={['access']} tab={tab} onTabChange={onTabChange} />
      ) : gate.kind === 'stopped' && probe.isPending ? (
        <LoadingState />
      ) : (
        <SectionMessage tone={gate.kind === 'denied' ? 'error' : 'empty'}>
          {t.gate[gate.kind]}
        </SectionMessage>
      )}
    </Shell>
  );
}

/** `access` is absent only for the stopped Owner, who sees Access alone. */
function LiveTabs({
  tabs,
  access,
  tab,
  onTabChange,
}: {
  tabs: FleetTab[];
  access?: LiveFleetAccess;
  tab: FleetTab | undefined;
  onTabChange: (tab: FleetTab) => void;
}) {
  const { t } = useFleetText();
  const active = tab && tabs.includes(tab) ? tab : tabs[0];
  const panels: Record<FleetTab, (live: LiveFleetAccess) => ReactNode> = {
    status: () => <StatusTab />,
    ask: (live) => <AskTab projects={live.projects} />,
    requests: (live) => <RequestsTab access={live} />,
    link: () => <LinkIdentityTab />,
    access: () => <AccessTab />,
  };
  const panel = (id: FleetTab) =>
    access ? panels[id](access) : id === 'access' && <AccessTab />;
  return (
    <Tabs
      value={active}
      onValueChange={(value) => onTabChange(value as FleetTab)}
      // The grants table needs more width than the reading tabs.
      className={active === 'access' ? 'max-w-5xl gap-6' : 'max-w-3xl gap-6'}
    >
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <TabsList className="w-max">
          {tabs.map((id) => (
            <TabsTrigger key={id} value={id}>
              {t.tabs[id]}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {tabs.map((id) => (
        <TabsContent key={id} value={id} className="space-y-6">
          {id === active && panel(id)}
        </TabsContent>
      ))}
    </Tabs>
  );
}
