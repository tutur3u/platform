'use client';

import { ChevronDown, Eye, Sparkles } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useState } from 'react';
import { ExperimentalFeatureDialog } from './experimental-feature-dialog';
import { SmartSchedulePreviewPanel } from './smart-schedule-preview-panel';

interface SmartScheduleButtonProps {
  wsId: string;
}

export function SmartScheduleButton({ wsId }: SmartScheduleButtonProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<'instant' | 'animated'>(
    'instant'
  );
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [showExperimentalDialog, setShowExperimentalDialog] = useState(false);
  const [hasAcknowledgedExperimental, setHasAcknowledgedExperimental] =
    useState(false);
  const [pendingPreviewMode, setPendingPreviewMode] = useState<
    'instant' | 'animated' | null
  >(null);

  const openPreview = (mode: 'instant' | 'animated') => {
    setDropdownOpen(false); // Close dropdown immediately
    setPreviewMode(mode);
    setPreviewOpen(true);
  };

  const requestPreview = (mode: 'instant' | 'animated') => {
    // Close dropdown immediately for responsiveness
    setDropdownOpen(false);

    // Only show the warning when the user explicitly tries Preview.
    if (!hasAcknowledgedExperimental) {
      setPendingPreviewMode(mode);
      setShowExperimentalDialog(true);
      return;
    }

    openPreview(mode);
  };

  return (
    <>
      <ExperimentalFeatureDialog
        open={showExperimentalDialog}
        onConfirm={() => {
          setHasAcknowledgedExperimental(true);
          setShowExperimentalDialog(false);

          if (pendingPreviewMode) {
            openPreview(pendingPreviewMode);
            setPendingPreviewMode(null);
          }
        }}
        onClose={() => {
          setShowExperimentalDialog(false);
          setPendingPreviewMode(null);
        }}
      />

      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            disabled={previewOpen}
            variant="default"
            size="sm"
            className="gap-1.5"
          >
            <Sparkles className="h-4 w-4" />
            <span className="hidden sm:inline">Smart Schedule</span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {/*<DropdownMenuItem
            onClick={handleSmartSchedule}
            className="cursor-pointer"
          >
            <Zap className="mr-2 h-4 w-4 text-dynamic-yellow" />
            <div className="flex flex-col">
              <span className="font-medium">Execute Now</span>
              <span className="text-muted-foreground text-xs">
                Apply immediately
              </span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuSeparator />*/}
          <DropdownMenuItem
            onClick={() => requestPreview('instant')}
            className="cursor-pointer"
          >
            <Eye className="mr-2 h-4 w-4 text-dynamic-blue" />
            <div className="flex flex-col">
              <span className="font-medium">Preview</span>
              <span className="text-muted-foreground text-xs">
                See all changes first
              </span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SmartSchedulePreviewPanel
        wsId={wsId}
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        mode={previewMode}
      />
    </>
  );
}
