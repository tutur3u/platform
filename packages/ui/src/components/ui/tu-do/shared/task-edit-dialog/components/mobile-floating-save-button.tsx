import { Check, Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';

interface MobileFloatingSaveButtonProps {
  isCreateMode: boolean;
  collaborationMode?: boolean;
  /** Whether realtime features (Yjs sync, presence avatars) are enabled - true for all tiers */
  realtimeEnabled?: boolean;
  isLoading: boolean;
  canSave: boolean;
  handleSave: () => void;
  disabled?: boolean;
}

export function MobileFloatingSaveButton({
  isCreateMode,
  collaborationMode,
  realtimeEnabled,
  isLoading,
  canSave,
  handleSave,
  disabled = false,
}: MobileFloatingSaveButtonProps) {
  // Hidden in edit mode when realtime is enabled (either cursors or Yjs sync) or in read-only mode
  if ((!isCreateMode && (collaborationMode || realtimeEnabled)) || disabled) {
    return null;
  }

  return (
    <div className="fixed right-4 bottom-4 z-40 md:hidden">
      <Button
        variant="default"
        size="lg"
        onClick={handleSave}
        disabled={!canSave}
        className="h-14 w-14 rounded-full bg-dynamic-orange shadow-lg hover:bg-dynamic-orange/90"
      >
        {isLoading ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : (
          <Check className="h-6 w-6" />
        )}
      </Button>
    </div>
  );
}
