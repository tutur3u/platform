import { Button } from '@tutur3u/ui/components/ui/button';
import { Sparkles } from 'lucide-react';

export default function FleetingNavigatorMenu({
  setCurrentView,
}: {
  setCurrentView: (
    view: 'assistant' | 'search' | 'settings' | undefined
  ) => void;
}) {
  return (
    <div className="flex h-full w-full items-center justify-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setCurrentView('assistant')}
      >
        <Sparkles className="h-5 w-5" />
      </Button>

      {/* <Separator orientation="vertical" className="mx-1 h-6" />

      <Button
        variant="ghost"
        size="icon"
        onClick={() => setCurrentView('search')}
        disabled
      >
        <MagnifyingGlassIcon className="h-5 w-5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setCurrentView('settings')}
        disabled
      >
        <Cog6ToothIcon className="h-5 w-5" />
      </Button> */}
    </div>
  );
}
