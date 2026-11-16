'use client';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@tuturuuu/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { CitationAttribution } from './citation-attribution';
import { CitationCaptureTab } from './citation-capture-tab';
import { CitationLibraryTab } from './citation-library-tab';
import type { CitationChoice } from './citation-source-card';
import type { CitationLabels } from './labels';
import type { CitationAdapter } from './types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  adapter: CitationAdapter;
  labels: CitationLabels;
  onChoose: (choice: CitationChoice) => void;
}

export function CitationDrawer({
  open,
  onOpenChange,
  adapter,
  labels,
  onChoose,
}: Props) {
  const isValid = (work: unknown) =>
    adapter.createSnapshot(work, null) !== null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md"
      >
        <SheetHeader>
          <SheetTitle>{labels.drawerTitle}</SheetTitle>
          <SheetDescription className="sr-only">
            {labels.drawerDescription}
          </SheetDescription>
        </SheetHeader>
        {open && (
          <Tabs
            defaultValue={adapter.library ? 'library' : 'capture'}
            className="flex flex-col gap-4 px-4 pb-6"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="library">{labels.libraryTab}</TabsTrigger>
              <TabsTrigger value="capture">{labels.captureTab}</TabsTrigger>
            </TabsList>
            <TabsContent value="library">
              <CitationLibraryTab
                library={adapter.library}
                renderManualEditor={adapter.renderManualEditor}
                canEditWork={adapter.canEditWork}
                isValid={isValid}
                labels={labels}
                onChoose={onChoose}
              />
            </TabsContent>
            <TabsContent value="capture">
              <CitationCaptureTab
                adapter={adapter}
                labels={labels}
                isValid={isValid}
                onChoose={onChoose}
              />
            </TabsContent>
          </Tabs>
        )}
        <div className="mt-auto border-border border-t px-4 py-4">
          <CitationAttribution labels={labels.attribution} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
