import type { FleetAccess } from '@tuturuuu/internal-api/fleet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import type { ReactNode } from 'react';
import { SectionMessage } from '../components/section';
import { PageHeader, Shell } from '../components/shell';
import { AskTab } from './ask-tab';
import { LinkIdentityTab } from './link-identity-tab';
import { type FleetTab, type LiveFleetAccess, visibleTabs } from './model';
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
  return (
    // The Owner keeps the full navigation; everyone else sees Fleet entries.
    <Shell
      scope={
        gate.kind === 'live' && gate.access.tier === 'owner' ? 'owner' : 'fleet'
      }
      footer={null}
    >
      <PageHeader
        title={t.title}
        subtitle={gate.kind === 'live' ? t.tier[gate.access.tier] : undefined}
      />
      {gate.kind === 'live' ? (
        <LiveTabs access={gate.access} tab={tab} onTabChange={onTabChange} />
      ) : (
        <SectionMessage tone={gate.kind === 'denied' ? 'error' : 'empty'}>
          {t.gate[gate.kind]}
        </SectionMessage>
      )}
    </Shell>
  );
}

function LiveTabs({
  access,
  tab,
  onTabChange,
}: {
  access: LiveFleetAccess;
  tab: FleetTab | undefined;
  onTabChange: (tab: FleetTab) => void;
}) {
  const { t } = useFleetText();
  const tabs = visibleTabs(access);
  const active = tab && tabs.includes(tab) ? tab : tabs[0];
  const panels: Record<FleetTab, () => ReactNode> = {
    status: () => <StatusTab />,
    ask: () => <AskTab projects={access.projects} />,
    requests: () => <RequestsTab access={access} />,
    link: () => <LinkIdentityTab />,
  };
  return (
    <Tabs
      value={active}
      onValueChange={(value) => onTabChange(value as FleetTab)}
      className="max-w-3xl gap-6"
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
          {id === active && panels[id]()}
        </TabsContent>
      ))}
    </Tabs>
  );
}
