import { Structure } from '@tuturuuu/ui/custom/structure';
import CalendarConnectionsUnified from '@tuturuuu/ui/calendar-app/components/calendar-connections-unified';
import { NextIntlClientProvider } from 'next-intl';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CalendarListSidebar } from '../../../../apps/calendar/src/components/calendar-list-sidebar';
import messages from '../../../../apps/calendar/messages/en.json';
import './style.css';

function Fixture() {
  const mode = new URLSearchParams(location.search).get('mode') ?? 'hover';
  const [collapsed, setCollapsed] = useState(mode !== 'expanded');
  const hover = mode === 'hover';
  return (
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <Structure
        contentFullBleed
        hideSizeToggle={hover}
        isCollapsed={collapsed}
        mobileHeader={<span>Synthetic Calendar</span>}
        onMouseEnter={hover ? () => setCollapsed(false) : undefined}
        onMouseLeave={hover ? () => setCollapsed(true) : undefined}
        overlayOnExpand={hover}
        setIsCollapsed={setCollapsed}
        sidebarContent={
          collapsed ? null : <CalendarListSidebar wsId="synthetic-workspace" />
        }
        sidebarHeader={<span aria-label="Calendar navigation">Calendar</span>}
        sidebarLabels={{ open: 'Open navigation', close: 'Close navigation' }}
      >
        <section className="flex min-h-0 flex-1 flex-col p-4">
          <h1 className="mb-4 font-semibold text-2xl">
            Synthetic Calendar week
          </h1>
          <CalendarConnectionsUnified
            wsId="synthetic-workspace"
            variant="status"
          />
          <div
            className="grid min-h-0 flex-1 grid-cols-7 grid-rows-12 gap-px bg-border"
            data-testid="calendar-grid"
          >
            {Array.from({ length: 84 }, (_, index) => (
              <div className="bg-background p-2 text-xs" key={index}>
                {index % 13 === 0 ? 'Synthetic event' : null}
              </div>
            ))}
          </div>
        </section>
      </Structure>
    </NextIntlClientProvider>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(<Fixture />);
