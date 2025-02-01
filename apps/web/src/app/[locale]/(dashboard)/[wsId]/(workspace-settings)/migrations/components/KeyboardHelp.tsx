import { defaultShortcuts, getShortcutDisplay } from '../utils/keyboard';
import { Button } from '@repo/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@repo/ui/components/ui/dialog';
import { Keyboard } from 'lucide-react';

export function KeyboardHelp() {
  // Group shortcuts by category
  const categories = {
    navigation: ['/', 'Escape', 'f'],
    actions: ['r', 'm'],
  };

  const getShortcutsByCategory = (category: keyof typeof categories) => {
    return defaultShortcuts.filter((s) => categories[category].includes(s.key));
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          <Keyboard className="h-4 w-4" />
          <span className="bg-primary absolute -top-1 -right-1 h-2 w-2 rounded-full" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>
            Use these shortcuts to speed up your workflow.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-6 space-y-6">
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Navigation</h3>
            <div className="rounded-lg border p-1">
              {getShortcutsByCategory('navigation').map((shortcut) => (
                <div
                  key={getShortcutDisplay(shortcut)}
                  className="hover:bg-muted/50 flex items-center justify-between rounded-md px-3 py-2"
                >
                  <span className="text-muted-foreground text-sm">
                    {shortcut.description}
                  </span>
                  <kbd className="bg-muted text-muted-foreground pointer-events-none inline-flex h-6 items-center gap-1 rounded border px-2 font-mono text-[12px] font-medium select-none">
                    {getShortcutDisplay(shortcut)}
                  </kbd>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-medium">Actions</h3>
            <div className="rounded-lg border p-1">
              {getShortcutsByCategory('actions').map((shortcut) => (
                <div
                  key={getShortcutDisplay(shortcut)}
                  className="hover:bg-muted/50 flex items-center justify-between rounded-md px-3 py-2"
                >
                  <span className="text-muted-foreground text-sm">
                    {shortcut.description}
                  </span>
                  <kbd className="bg-muted text-muted-foreground pointer-events-none inline-flex h-6 items-center gap-1 rounded border px-2 font-mono text-[12px] font-medium select-none">
                    {getShortcutDisplay(shortcut)}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
