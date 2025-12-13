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

  const openPreview = (mode: 'instant' | 'animated') => {
    setDropdownOpen(false); // Close dropdown immediately
    setPreviewMode(mode);
    setPreviewOpen(true);
  };

  return (
    <>
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
            onClick={() => openPreview('instant')}
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
