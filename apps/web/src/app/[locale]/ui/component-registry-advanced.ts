import type { ComponentEntry } from './component-registry-core';
import { usage } from './component-registry-core';

export const advancedComponentEntries: ComponentEntry[] = [
  {
    id: 'menubar',
    name: 'Menubar',
    category: 'navigation',
    importPath: '@tuturuuu/ui/menubar',
    exports: ['Menubar', 'MenubarMenu', 'MenubarTrigger', 'MenubarContent'],
    customizationKeys: ['menus', 'shortcuts', 'radioItems'],
    usage: usage(
      '@tuturuuu/ui/menubar',
      ['Menubar', 'MenubarContent', 'MenubarMenu', 'MenubarTrigger'],
      `<Menubar>\n  <MenubarMenu><MenubarTrigger>File</MenubarTrigger><MenubarContent /></MenubarMenu>\n</Menubar>`
    ),
  },
  {
    id: 'navbar',
    name: 'Navbar',
    category: 'navigation',
    importPath: '@tuturuuu/ui/navbar',
    exports: ['Navbar'],
    customizationKeys: ['logo', 'actions', 'navigation'],
    usage: usage(
      '@tuturuuu/ui/navbar',
      ['Navbar'],
      `<Navbar title="Tuturuuu" navigationMenu={<MainNavigation />} actions={<UserActions />} />`
    ),
    safePreview: false,
  },
  {
    id: 'navigation-menu',
    name: 'Navigation Menu',
    category: 'navigation',
    importPath: '@tuturuuu/ui/navigation-menu',
    exports: ['NavigationMenu', 'NavigationMenuList', 'NavigationMenuItem'],
    customizationKeys: ['items', 'content', 'viewport'],
    usage: usage(
      '@tuturuuu/ui/navigation-menu',
      ['NavigationMenu', 'NavigationMenuItem', 'NavigationMenuList'],
      `<NavigationMenu><NavigationMenuList><NavigationMenuItem /></NavigationMenuList></NavigationMenu>`
    ),
  },
  {
    id: 'pagination',
    name: 'Pagination',
    category: 'navigation',
    importPath: '@tuturuuu/ui/pagination',
    exports: [
      'Pagination',
      'PaginationContent',
      'PaginationItem',
      'PaginationLink',
    ],
    customizationKeys: ['page', 'siblings', 'disabled'],
    usage: usage(
      '@tuturuuu/ui/pagination',
      ['Pagination', 'PaginationContent', 'PaginationItem', 'PaginationLink'],
      `<Pagination><PaginationContent><PaginationItem><PaginationLink href="#">1</PaginationLink></PaginationItem></PaginationContent></Pagination>`
    ),
  },
  {
    id: 'popover',
    name: 'Popover',
    category: 'overlays',
    importPath: '@tuturuuu/ui/popover',
    exports: ['Popover', 'PopoverTrigger', 'PopoverContent'],
    customizationKeys: ['side', 'align', 'content'],
    usage: usage(
      '@tuturuuu/ui/popover',
      ['Popover', 'PopoverContent', 'PopoverTrigger'],
      `<Popover><PopoverTrigger>Open</PopoverTrigger><PopoverContent>Popover content</PopoverContent></Popover>`
    ),
  },
  {
    id: 'progress',
    name: 'Progress',
    category: 'feedback',
    importPath: '@tuturuuu/ui/progress',
    exports: ['Progress'],
    customizationKeys: ['value', 'indicator', 'label'],
    usage: usage(
      '@tuturuuu/ui/progress',
      ['Progress'],
      `<Progress value={72} />`
    ),
  },
  {
    id: 'radio-group',
    name: 'Radio Group',
    category: 'inputs',
    importPath: '@tuturuuu/ui/radio-group',
    exports: ['RadioGroup', 'RadioGroupItem'],
    customizationKeys: ['orientation', 'defaultValue', 'labels'],
    usage: usage(
      '@tuturuuu/ui/radio-group',
      ['RadioGroup', 'RadioGroupItem'],
      `<RadioGroup defaultValue="compact"><RadioGroupItem value="compact" /></RadioGroup>`
    ),
  },
  {
    id: 'report-problem-dialog',
    name: 'Report Problem Dialog',
    category: 'advanced',
    importPath: '@tuturuuu/ui/report-problem-dialog',
    exports: ['ReportProblemDialog'],
    customizationKeys: ['product', 'uploadLimit', 'mutation'],
    usage: usage(
      '@tuturuuu/ui/report-problem-dialog',
      ['ReportProblemDialog'],
      `<ReportProblemDialog product="web" />`
    ),
    safePreview: false,
  },
  {
    id: 'resizable',
    name: 'Resizable',
    category: 'layout',
    importPath: '@tuturuuu/ui/resizable',
    exports: ['ResizablePanelGroup', 'ResizablePanel', 'ResizableHandle'],
    customizationKeys: ['direction', 'defaultSize', 'handle'],
    usage: usage(
      '@tuturuuu/ui/resizable',
      ['ResizableHandle', 'ResizablePanel', 'ResizablePanelGroup'],
      `<ResizablePanelGroup direction="horizontal">\n  <ResizablePanel>Primary</ResizablePanel><ResizableHandle withHandle /><ResizablePanel>Secondary</ResizablePanel>\n</ResizablePanelGroup>`
    ),
  },
  {
    id: 'scroll-area',
    name: 'Scroll Area',
    category: 'layout',
    importPath: '@tuturuuu/ui/scroll-area',
    exports: ['ScrollArea', 'ScrollBar'],
    customizationKeys: ['height', 'scrollbar', 'content'],
    usage: usage(
      '@tuturuuu/ui/scroll-area',
      ['ScrollArea'],
      `<ScrollArea className="h-48">Scrollable content</ScrollArea>`
    ),
  },
  {
    id: 'select',
    name: 'Select',
    category: 'inputs',
    importPath: '@tuturuuu/ui/select',
    exports: ['Select', 'SelectTrigger', 'SelectContent', 'SelectItem'],
    customizationKeys: ['options', 'placeholder', 'disabled'],
    usage: usage(
      '@tuturuuu/ui/select',
      ['Select', 'SelectContent', 'SelectItem', 'SelectTrigger', 'SelectValue'],
      `<Select><SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger><SelectContent><SelectItem value="one">One</SelectItem></SelectContent></Select>`
    ),
  },
  {
    id: 'separator',
    name: 'Separator',
    category: 'layout',
    importPath: '@tuturuuu/ui/separator',
    exports: ['Separator'],
    customizationKeys: ['orientation', 'spacing', 'decorative'],
    usage: usage(
      '@tuturuuu/ui/separator',
      ['Separator'],
      `<Separator orientation="horizontal" />`
    ),
  },
  {
    id: 'sheet',
    name: 'Sheet',
    category: 'overlays',
    importPath: '@tuturuuu/ui/sheet',
    exports: ['Sheet', 'SheetTrigger', 'SheetContent'],
    customizationKeys: ['side', 'size', 'footer'],
    usage: usage(
      '@tuturuuu/ui/sheet',
      ['Sheet', 'SheetContent', 'SheetTrigger'],
      `<Sheet><SheetTrigger>Open panel</SheetTrigger><SheetContent side="right">Panel content</SheetContent></Sheet>`
    ),
  },
  {
    id: 'sidebar',
    name: 'Sidebar',
    category: 'navigation',
    importPath: '@tuturuuu/ui/sidebar',
    exports: ['SidebarProvider', 'Sidebar', 'SidebarMenu', 'SidebarTrigger'],
    customizationKeys: ['collapsible', 'variant', 'groups'],
    usage: usage(
      '@tuturuuu/ui/sidebar',
      ['Sidebar', 'SidebarProvider', 'SidebarTrigger'],
      `<SidebarProvider><Sidebar /><SidebarTrigger /></SidebarProvider>`
    ),
    safePreview: false,
  },
  {
    id: 'skeleton',
    name: 'Skeleton',
    category: 'feedback',
    importPath: '@tuturuuu/ui/skeleton',
    exports: ['Skeleton'],
    customizationKeys: ['shape', 'size', 'layout'],
    usage: usage(
      '@tuturuuu/ui/skeleton',
      ['Skeleton'],
      `<Skeleton className="h-6 w-32" />`
    ),
  },
  {
    id: 'slider',
    name: 'Slider',
    category: 'inputs',
    importPath: '@tuturuuu/ui/slider',
    exports: ['Slider'],
    customizationKeys: ['minMax', 'step', 'value'],
    usage: usage(
      '@tuturuuu/ui/slider',
      ['Slider'],
      `<Slider defaultValue={[64]} max={100} step={1} />`
    ),
  },
  {
    id: 'sonner',
    name: 'Sonner',
    category: 'feedback',
    importPath: '@tuturuuu/ui/sonner',
    exports: ['Toaster', 'toast'],
    customizationKeys: ['theme', 'position', 'action'],
    usage: usage(
      '@tuturuuu/ui/sonner',
      ['Toaster', 'toast'],
      `toast.success('Saved changes');\n\n<Toaster />`
    ),
  },
  {
    id: 'sticky-bottom-bar',
    name: 'Sticky Bottom Bar',
    category: 'feedback',
    importPath: '@tuturuuu/ui/sticky-bottom-bar',
    exports: ['StickyBottomBar'],
    customizationKeys: ['visibility', 'message', 'actions'],
    usage: usage(
      '@tuturuuu/ui/sticky-bottom-bar',
      ['StickyBottomBar'],
      `<StickyBottomBar show message="Unsaved changes" actions={<Button>Save</Button>} />`
    ),
    safePreview: false,
  },
  {
    id: 'switch',
    name: 'Switch',
    category: 'inputs',
    importPath: '@tuturuuu/ui/switch',
    exports: ['Switch'],
    customizationKeys: ['checked', 'disabled', 'label'],
    usage: usage(
      '@tuturuuu/ui/switch',
      ['Switch'],
      `<Switch defaultChecked />`
    ),
  },
  {
    id: 'table',
    name: 'Table',
    category: 'data',
    importPath: '@tuturuuu/ui/table',
    exports: [
      'Table',
      'TableHeader',
      'TableRow',
      'TableHead',
      'TableBody',
      'TableCell',
    ],
    customizationKeys: ['columns', 'density', 'emptyState'],
    usage: usage(
      '@tuturuuu/ui/table',
      [
        'Table',
        'TableBody',
        'TableCell',
        'TableHead',
        'TableHeader',
        'TableRow',
      ],
      `<Table><TableHeader><TableRow><TableHead>Name</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell>Mira</TableCell></TableRow></TableBody></Table>`
    ),
  },
  {
    id: 'tabs',
    name: 'Tabs',
    category: 'navigation',
    importPath: '@tuturuuu/ui/tabs',
    exports: ['Tabs', 'TabsList', 'TabsTrigger', 'TabsContent'],
    customizationKeys: ['defaultValue', 'orientation', 'content'],
    usage: usage(
      '@tuturuuu/ui/tabs',
      ['Tabs', 'TabsContent', 'TabsList', 'TabsTrigger'],
      `<Tabs defaultValue="preview"><TabsList><TabsTrigger value="preview">Preview</TabsTrigger></TabsList><TabsContent value="preview">Content</TabsContent></Tabs>`
    ),
  },
  {
    id: 'textarea',
    name: 'Textarea',
    category: 'inputs',
    importPath: '@tuturuuu/ui/textarea',
    exports: ['Textarea'],
    customizationKeys: ['rows', 'placeholder', 'resize'],
    usage: usage(
      '@tuturuuu/ui/textarea',
      ['Textarea'],
      `<Textarea placeholder="Write an update..." />`
    ),
  },
  {
    id: 'time-picker-input',
    name: 'Time Picker Input',
    category: 'inputs',
    importPath: '@tuturuuu/ui/time-picker-input',
    exports: ['TimePickerInput'],
    customizationKeys: ['picker', 'date', 'keyboard'],
    usage: usage(
      '@tuturuuu/ui/time-picker-input',
      ['TimePickerInput'],
      `<TimePickerInput picker="hours" date={date} setDate={setDate} />`
    ),
  },
  {
    id: 'toast',
    name: 'Toast',
    category: 'feedback',
    importPath: '@tuturuuu/ui/toast',
    exports: ['Toast', 'ToastTitle', 'ToastDescription', 'ToastProvider'],
    customizationKeys: ['variant', 'action', 'viewport'],
    usage: usage(
      '@tuturuuu/ui/toast',
      ['Toast', 'ToastDescription', 'ToastTitle'],
      `<Toast><ToastTitle>Saved</ToastTitle><ToastDescription>Your changes are live.</ToastDescription></Toast>`
    ),
  },
  {
    id: 'toaster',
    name: 'Toaster',
    category: 'feedback',
    importPath: '@tuturuuu/ui/toaster',
    exports: ['Toaster'],
    customizationKeys: ['provider', 'viewport', 'hooks'],
    usage: usage('@tuturuuu/ui/toaster', ['Toaster'], `<Toaster />`),
  },
  {
    id: 'toggle',
    name: 'Toggle',
    category: 'actions',
    importPath: '@tuturuuu/ui/toggle',
    exports: ['Toggle', 'toggleVariants'],
    customizationKeys: ['pressed', 'variant', 'size'],
    usage: usage(
      '@tuturuuu/ui/toggle',
      ['Toggle'],
      `<Toggle aria-label="Toggle bold">B</Toggle>`
    ),
  },
  {
    id: 'toggle-group',
    name: 'Toggle Group',
    category: 'actions',
    importPath: '@tuturuuu/ui/toggle-group',
    exports: ['ToggleGroup', 'ToggleGroupItem'],
    customizationKeys: ['type', 'selection', 'size'],
    usage: usage(
      '@tuturuuu/ui/toggle-group',
      ['ToggleGroup', 'ToggleGroupItem'],
      `<ToggleGroup type="single" defaultValue="list"><ToggleGroupItem value="list">List</ToggleGroupItem></ToggleGroup>`
    ),
  },
  {
    id: 'tooltip',
    name: 'Tooltip',
    category: 'overlays',
    importPath: '@tuturuuu/ui/tooltip',
    exports: ['Tooltip', 'TooltipTrigger', 'TooltipContent', 'TooltipProvider'],
    customizationKeys: ['delay', 'side', 'content'],
    usage: usage(
      '@tuturuuu/ui/tooltip',
      ['Tooltip', 'TooltipContent', 'TooltipTrigger'],
      `<Tooltip><TooltipTrigger>Hover</TooltipTrigger><TooltipContent>Helpful context</TooltipContent></Tooltip>`
    ),
  },
];
