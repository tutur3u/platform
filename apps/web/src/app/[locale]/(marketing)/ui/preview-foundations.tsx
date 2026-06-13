'use client';

import { AlertCircle, ChevronRight, MoreHorizontal } from '@tuturuuu/icons';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@tuturuuu/ui/command';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@tuturuuu/ui/context-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { DiffViewer } from '@tuturuuu/ui/diff-viewer';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@tuturuuu/ui/drawer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { FormRequiredIndicator } from '@tuturuuu/ui/form-required-indicator';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@tuturuuu/ui/hover-card';
import { Input } from '@tuturuuu/ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@tuturuuu/ui/input-otp';
import { Kbd } from '@tuturuuu/ui/kbd';
import { Label } from '@tuturuuu/ui/label';
import { MemoizedReactMarkdown } from '@tuturuuu/ui/markdown';
import type { PreviewKind } from './component-registry';
import {
  ChartPreview,
  ColorPickerPreview,
  CurrencyInputPreview,
  DateTimePickerPreview,
  FormPreview,
  OptionalTimePickerPreview,
} from './preview-foundation-controls';
import { renderFoundationLayoutPreview } from './preview-foundation-layouts';

type SampleTranslator = (key: string) => string;

export function renderFoundationPreview(
  kind: PreviewKind,
  s: SampleTranslator
) {
  const layoutPreview = renderFoundationLayoutPreview(kind, s);

  if (layoutPreview) {
    return layoutPreview;
  }

  switch (kind) {
    case 'accordion':
      return (
        <Accordion className="w-full" collapsible type="single">
          <AccordionItem value="overview">
            <AccordionTrigger>{s('overview')}</AccordionTrigger>
            <AccordionContent>{s('accordionContent')}</AccordionContent>
          </AccordionItem>
        </Accordion>
      );
    case 'alert':
      return (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{s('ready')}</AlertTitle>
          <AlertDescription>{s('readyDescription')}</AlertDescription>
        </Alert>
      );
    case 'alert-dialog':
      return (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline">{s('openConfirmation')}</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{s('confirmTitle')}</AlertDialogTitle>
              <AlertDialogDescription>
                {s('confirmDescription')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{s('cancel')}</AlertDialogCancel>
              <AlertDialogAction>{s('continue')}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      );
    case 'chart':
      return <ChartPreview />;
    case 'checkbox':
      return (
        <div className="grid gap-3">
          {[s('ship'), s('document'), s('monitor')].map((label, index) => (
            <label className="flex items-center gap-2 text-sm" key={label}>
              <Checkbox defaultChecked={index < 2} />
              {label}
            </label>
          ))}
        </div>
      );
    case 'codeblock':
      return (
        <pre className="w-full overflow-auto rounded-lg border bg-muted/50 p-4 text-sm">
          <code>{`<Button variant="secondary">${s('preview')}</Button>`}</code>
        </pre>
      );
    case 'collapsible':
      return (
        <Collapsible className="w-full rounded-lg border p-3" defaultOpen>
          <CollapsibleTrigger className="flex w-full items-center justify-between font-medium text-sm">
            {s('releaseNotes')}
            <ChevronRight className="h-4 w-4" />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 text-muted-foreground text-sm">
            {s('collapsibleContent')}
          </CollapsibleContent>
        </Collapsible>
      );
    case 'color-picker':
      return <ColorPickerPreview />;
    case 'command':
      return (
        <Command className="rounded-lg border">
          <CommandInput placeholder={s('searchPlaceholder')} />
          <CommandList>
            <CommandEmpty>{s('emptySearch')}</CommandEmpty>
            <CommandGroup heading={s('quickActions')}>
              <CommandItem>{s('openDashboard')}</CommandItem>
              <CommandItem>{s('createTask')}</CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      );
    case 'context-menu':
      return (
        <ContextMenu>
          <ContextMenuTrigger className="flex h-24 w-full items-center justify-center rounded-lg border border-dashed bg-muted/40 text-sm">
            {s('rightClick')}
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem>{s('duplicate')}</ContextMenuItem>
            <ContextMenuItem>{s('archive')}</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      );
    case 'currency-input':
      return <CurrencyInputPreview />;
    case 'date-time-picker':
      return <DateTimePickerPreview />;
    case 'optional-time-picker':
      return <OptionalTimePickerPreview s={s} />;
    case 'dialog':
      return (
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">{s('openDialog')}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{s('dialogTitle')}</DialogTitle>
              <DialogDescription>{s('dialogDescription')}</DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      );
    case 'diff-viewer':
      return (
        <DiffViewer
          className="max-h-48 overflow-hidden rounded-lg border"
          newValue={`const state = '${s('active')}';`}
          oldValue={`const state = '${s('queued')}';`}
          wrapper="inline"
        />
      );
    case 'drawer':
      return (
        <Drawer>
          <DrawerTrigger asChild>
            <Button variant="outline">{s('openDrawer')}</Button>
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>{s('drawerTitle')}</DrawerTitle>
              <DrawerDescription>{s('drawerDescription')}</DrawerDescription>
            </DrawerHeader>
          </DrawerContent>
        </Drawer>
      );
    case 'dropdown-menu':
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              {s('actions')}
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>{s('rename')}</DropdownMenuItem>
            <DropdownMenuItem>{s('duplicate')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    case 'form':
      return <FormPreview s={s} />;
    case 'form-required-indicator':
      return (
        <Label>
          {s('workspaceName')}
          <FormRequiredIndicator />
        </Label>
      );
    case 'hover-card':
      return (
        <HoverCard>
          <HoverCardTrigger asChild>
            <Button variant="link">{s('hoverProfile')}</Button>
          </HoverCardTrigger>
          <HoverCardContent>
            <div className="font-medium">{s('mira')}</div>
            <p className="text-muted-foreground text-sm">{s('profileCopy')}</p>
          </HoverCardContent>
        </HoverCard>
      );
    case 'input':
      return <Input placeholder={s('workspacePlaceholder')} />;
    case 'input-otp':
      return (
        <InputOTP maxLength={6} value="123456">
          <InputOTPGroup>
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <InputOTPSlot index={index} key={index} />
            ))}
          </InputOTPGroup>
        </InputOTP>
      );
    case 'kbd':
      return (
        <div className="flex items-center gap-2">
          <Kbd>Cmd</Kbd>
          <Kbd>K</Kbd>
        </div>
      );
    case 'label':
      return (
        <div className="grid gap-2">
          <Label htmlFor="showcase-label-demo">{s('workspaceName')}</Label>
          <Input
            id="showcase-label-demo"
            placeholder={s('workspacePlaceholder')}
          />
        </div>
      );
    case 'markdown':
      return (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <MemoizedReactMarkdown>{`**${s('releaseNotes')}**\n\n- ${s('ship')}\n- ${s('document')}`}</MemoizedReactMarkdown>
        </div>
      );
    default:
      return null;
  }
}
