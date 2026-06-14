'use client';

import { Bell, Save } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
} from '@tuturuuu/ui/menubar';
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from '@tuturuuu/ui/navigation-menu';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@tuturuuu/ui/pagination';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { Progress } from '@tuturuuu/ui/progress';
import { RadioGroup, RadioGroupItem } from '@tuturuuu/ui/radio-group';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@tuturuuu/ui/resizable';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@tuturuuu/ui/sheet';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { Slider } from '@tuturuuu/ui/slider';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Textarea } from '@tuturuuu/ui/textarea';
import {
  Toast,
  ToastDescription,
  ToastProvider,
  ToastTitle,
} from '@tuturuuu/ui/toast';
import { Toggle } from '@tuturuuu/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@tuturuuu/ui/toggle-group';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import type { PreviewKind } from './component-registry';
import {
  ReportProblemShell,
  SidebarShell,
  StaticNavShell,
  StickyBottomShell,
  TablePreview,
  TimePickerPreview,
  ToasterShell,
} from './preview-advanced-shells';

type SampleTranslator = (key: string) => string;

export function renderAdvancedPreview(kind: PreviewKind, s: SampleTranslator) {
  switch (kind) {
    case 'menubar':
      return (
        <Menubar>
          <MenubarMenu>
            <MenubarTrigger>{s('file')}</MenubarTrigger>
            <MenubarContent>
              <MenubarItem>{s('newFile')}</MenubarItem>
              <MenubarItem>{s('save')}</MenubarItem>
            </MenubarContent>
          </MenubarMenu>
        </Menubar>
      );
    case 'navbar':
      return <StaticNavShell s={s} />;
    case 'navigation-menu':
      return (
        <NavigationMenu viewport={false}>
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuTrigger>{s('resources')}</NavigationMenuTrigger>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink href="#">{s('docs')}</NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
      );
    case 'pagination':
      return (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious href="#" />
            </PaginationItem>
            {[1, 2, 3].map((page) => (
              <PaginationItem key={page}>
                <PaginationLink href="#" isActive={page === 2}>
                  {page}
                </PaginationLink>
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationNext href="#" />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      );
    case 'popover':
      return (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">{s('openPopover')}</Button>
          </PopoverTrigger>
          <PopoverContent className="w-64">
            <div className="font-medium">{s('quickSettings')}</div>
            <p className="text-muted-foreground text-sm">{s('popoverCopy')}</p>
          </PopoverContent>
        </Popover>
      );
    case 'progress':
      return (
        <div className="grid w-full gap-2">
          <div className="flex items-center justify-between text-sm">
            <span>{s('migration')}</span>
            <span className="text-muted-foreground">72%</span>
          </div>
          <Progress value={72} />
        </div>
      );
    case 'radio-group':
      return (
        <RadioGroup className="grid gap-2" defaultValue="comfortable">
          {['compact', 'comfortable', 'spacious'].map((value) => (
            <label className="flex items-center gap-2 text-sm" key={value}>
              <RadioGroupItem value={value} />
              {s(value)}
            </label>
          ))}
        </RadioGroup>
      );
    case 'report-problem-dialog':
      return <ReportProblemShell s={s} />;
    case 'resizable':
      return (
        <ResizablePanelGroup
          className="h-32 rounded-lg border"
          direction="horizontal"
        >
          <ResizablePanel defaultSize={58}>
            <div className="flex h-full items-center justify-center text-sm">
              {s('preview')}
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={42}>
            <div className="flex h-full items-center justify-center text-sm">
              {s('props')}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      );
    case 'scroll-area':
      return (
        <ScrollArea className="h-32 rounded-lg border p-3">
          <div className="grid gap-2">
            {Array.from({ length: 8 }, (_, index) => (
              <div
                className="rounded-md bg-muted px-3 py-2 text-sm"
                key={index}
              >
                {s('activity')} {index + 1}
              </div>
            ))}
          </div>
        </ScrollArea>
      );
    case 'select':
      return (
        <Select defaultValue="dashboard">
          <SelectTrigger>
            <SelectValue placeholder={s('chooseView')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dashboard">{s('dashboard')}</SelectItem>
            <SelectItem value="analytics">{s('analytics')}</SelectItem>
          </SelectContent>
        </Select>
      );
    case 'separator':
      return (
        <div className="grid w-full gap-4">
          <div className="font-medium text-sm">{s('sectionTitle')}</div>
          <Separator />
          <div className="text-muted-foreground text-sm">
            {s('sectionCopy')}
          </div>
        </div>
      );
    case 'sheet':
      return (
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline">{s('openPanel')}</Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>{s('panelTitle')}</SheetTitle>
              <SheetDescription>{s('panelDescription')}</SheetDescription>
            </SheetHeader>
          </SheetContent>
        </Sheet>
      );
    case 'sidebar':
      return <SidebarShell s={s} />;
    case 'skeleton':
      return (
        <div className="grid w-full gap-3">
          <Skeleton className="h-5 w-2/5" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      );
    case 'slider':
      return <Slider defaultValue={[64]} max={100} step={1} />;
    case 'sonner':
      return (
        <Button
          onClick={() =>
            toast.success(s('saved'), { description: s('toastCopy') })
          }
          variant="outline"
        >
          <Bell />
          {s('showToast')}
        </Button>
      );
    case 'sticky-bottom-bar':
      return <StickyBottomShell s={s} />;
    case 'switch':
      return (
        <label className="flex items-center gap-3 text-sm">
          <Switch defaultChecked />
          {s('enableNotifications')}
        </label>
      );
    case 'table':
      return <TablePreview s={s} />;
    case 'tabs':
      return (
        <Tabs className="w-full" defaultValue="preview">
          <TabsList>
            <TabsTrigger value="preview">{s('preview')}</TabsTrigger>
            <TabsTrigger value="usage">{s('usage')}</TabsTrigger>
          </TabsList>
          <TabsContent
            className="rounded-lg border p-3 text-sm"
            value="preview"
          >
            {s('tabsContent')}
          </TabsContent>
          <TabsContent className="rounded-lg border p-3 text-sm" value="usage">
            {s('usageContent')}
          </TabsContent>
        </Tabs>
      );
    case 'textarea':
      return <Textarea placeholder={s('textareaPlaceholder')} rows={4} />;
    case 'time-picker-input':
      return <TimePickerPreview />;
    case 'toast':
      return (
        <ToastProvider>
          <Toast className="relative" open>
            <div className="grid gap-1">
              <ToastTitle>{s('saved')}</ToastTitle>
              <ToastDescription>{s('toastCopy')}</ToastDescription>
            </div>
          </Toast>
        </ToastProvider>
      );
    case 'toaster':
      return <ToasterShell s={s} />;
    case 'toggle':
      return <Toggle defaultPressed>{s('bold')}</Toggle>;
    case 'toggle-group':
      return (
        <ToggleGroup defaultValue="list" type="single">
          <ToggleGroupItem value="list">{s('list')}</ToggleGroupItem>
          <ToggleGroupItem value="grid">{s('grid')}</ToggleGroupItem>
        </ToggleGroup>
      );
    case 'tooltip':
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="outline">
                <Save />
                <span className="sr-only">{s('save')}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{s('saveDraft')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    default:
      return null;
  }
}
