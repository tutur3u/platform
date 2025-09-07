import { Button } from '@tuturuuu/ui/button';
import { useTimeBlocking } from '@tuturuuu/ui/hooks/time-blocking-provider';
import { Save } from '@tuturuuu/ui/icons';

export default function StickyBottomIndicator() {
  const { handleSave, isDirty, isSaving } = useTimeBlocking();

  return (
    <div className="md:-translate-x-1/2 fixed right-0 bottom-2 left-0 z-50 rounded-2xl bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:right-auto md:left-1/2">
      <div className="flex w-full items-center justify-between px-4 py-4 md:w-[42rem] md:px-6 lg:w-[56rem] lg:px-10">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 animate-pulse rounded-full bg-amber-500"></div>
          <span className="text-balance font-medium text-foreground text-sm">
            Careful — you have unsaved changes!
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="lg"
            onClick={handleSave}
            disabled={!isDirty || isSaving}
          >
            <Save size={16} />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}
