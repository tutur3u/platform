import { Check, Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';

interface MobileFloatingSaveButtonProps {
  isCreateMode: boolean;
  collaborationMode?: boolean;
  isLoading: boolean;
  canSave: boolean;
  handleSave: () => void;
}

export function MobileFloatingSaveButton({
  isCreateMode,
  collaborationMode,
  isLoading,
  canSave,
  handleSave,
}: MobileFloatingSaveButtonProps) {
  // Hidden in edit mode when collaboration is enabled
  if (!isCreateMode && collaborationMode) {
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
