import { Forward, Monitor, Moon, Reply, ReplyAll, Sun } from '@tuturuuu/icons';
import { createRoot } from 'react-dom/client';
import { Button } from '../../src/components/ui/button';
import {
  FloatingBar,
  FloatingBarGroup,
  FloatingBarSeparator,
} from '../../src/components/ui/floating-bar';
import { Tabs, TabsList, TabsTrigger } from '../../src/components/ui/tabs';
import '../../src/globals.css';

// Standalone geometry fixture: a message action bar, an icon-only bar and a
// segmented Tabs track, in light/dark and classic/Sorbet.
const params = new URLSearchParams(location.search);
document.documentElement.classList.toggle(
  'dark',
  params.get('theme') === 'dark'
);
if (params.get('ui') === 'sorbet')
  document.documentElement.dataset.ui = 'sorbet';

function Bar({
  compact,
  name,
  className,
}: {
  compact?: boolean;
  name?: string;
  className?: string;
}) {
  const action = (Icon: typeof Reply, label: string, active?: boolean) =>
    compact ? (
      <Button
        aria-label={label}
        size="icon"
        variant={active ? 'secondary' : 'ghost'}
      >
        <Icon />
      </Button>
    ) : (
      <Button size="sm" variant={active ? 'secondary' : 'ghost'}>
        <Icon />
        {label}
      </Button>
    );
  return (
    <FloatingBar
      aria-label={name ?? (compact ? 'Compact actions' : 'Message actions')}
      data-fixture={name ?? (compact ? 'compact' : 'full')}
      className={className}
    >
      {action(Reply, 'Reply', true)}
      {action(ReplyAll, 'Reply all')}
      {action(Forward, 'Forward')}
      <FloatingBarSeparator />
      <FloatingBarGroup aria-label="Appearance">
        {[Monitor, Moon, Sun].map((Icon, index) => (
          <Button
            key={Icon.displayName ?? index}
            aria-label={`Appearance ${index}`}
            size="icon"
            variant={index === 0 ? 'secondary' : 'ghost'}
          >
            <Icon />
          </Button>
        ))}
      </FloatingBarGroup>
    </FloatingBar>
  );
}

createRoot(document.getElementById('root')!).render(
  <main className="flex min-h-screen flex-col items-center gap-8 bg-muted/40 p-10 text-foreground">
    <Bar />
    <Bar compact />
    <Bar compact name="large" className="[--bar-control-height:2.5rem]" />
    <Bar compact name="rect" className="[--bar-radius-max:1rem]" />
    <div className="w-64">
      <Bar name="wrapped" className="flex-wrap" />
    </div>
    <Tabs defaultValue="unread" data-fixture="tabs">
      <TabsList>
        <TabsTrigger value="unread">Unread</TabsTrigger>
        <TabsTrigger value="all">All</TabsTrigger>
        <TabsTrigger value="archived">Archived</TabsTrigger>
      </TabsList>
    </Tabs>
  </main>
);
