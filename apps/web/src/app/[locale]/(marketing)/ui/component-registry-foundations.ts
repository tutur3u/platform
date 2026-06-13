import type { ComponentEntry } from './component-registry-core';
import { usage } from './component-registry-core';
import { foundationInputComponentEntries } from './component-registry-foundation-inputs';

export const foundationComponentEntries: ComponentEntry[] = [
  {
    id: 'accordion',
    name: 'Accordion',
    category: 'layout',
    importPath: '@tuturuuu/ui/accordion',
    exports: [
      'Accordion',
      'AccordionItem',
      'AccordionTrigger',
      'AccordionContent',
    ],
    customizationKeys: ['type', 'collapsible', 'contentDensity'],
    usage: usage(
      '@tuturuuu/ui/accordion',
      ['Accordion', 'AccordionContent', 'AccordionItem', 'AccordionTrigger'],
      `<Accordion type="single" collapsible>\n  <AccordionItem value="overview">\n    <AccordionTrigger>Overview</AccordionTrigger>\n    <AccordionContent>Composable disclosure content.</AccordionContent>\n  </AccordionItem>\n</Accordion>`
    ),
  },
  {
    id: 'alert',
    name: 'Alert',
    category: 'feedback',
    importPath: '@tuturuuu/ui/alert',
    exports: ['Alert', 'AlertTitle', 'AlertDescription'],
    customizationKeys: ['variant', 'icon', 'tone'],
    usage: usage(
      '@tuturuuu/ui/alert',
      ['Alert', 'AlertDescription', 'AlertTitle'],
      `<Alert>\n  <AlertTitle>Deployment ready</AlertTitle>\n  <AlertDescription>All required checks have passed.</AlertDescription>\n</Alert>`
    ),
  },
  {
    id: 'alert-dialog',
    name: 'Alert Dialog',
    category: 'overlays',
    importPath: '@tuturuuu/ui/alert-dialog',
    exports: ['AlertDialog', 'AlertDialogTrigger', 'AlertDialogContent'],
    customizationKeys: ['trigger', 'destructiveAction', 'copy'],
    usage: usage(
      '@tuturuuu/ui/alert-dialog',
      ['AlertDialog', 'AlertDialogContent', 'AlertDialogTrigger'],
      `<AlertDialog>\n  <AlertDialogTrigger>Open confirmation</AlertDialogTrigger>\n  <AlertDialogContent>Confirm the irreversible action.</AlertDialogContent>\n</AlertDialog>`
    ),
  },
  {
    id: 'aspect-ratio',
    name: 'Aspect Ratio',
    category: 'layout',
    importPath: '@tuturuuu/ui/aspect-ratio',
    exports: ['AspectRatio'],
    customizationKeys: ['ratio', 'media', 'radius'],
    usage: usage(
      '@tuturuuu/ui/aspect-ratio',
      ['AspectRatio'],
      `<AspectRatio ratio={16 / 9}>\n  <img src="/preview.png" alt="" className="h-full w-full object-cover" />\n</AspectRatio>`
    ),
  },
  {
    id: 'avatar',
    name: 'Avatar',
    category: 'feedback',
    importPath: '@tuturuuu/ui/avatar',
    exports: ['Avatar', 'AvatarImage', 'AvatarFallback'],
    customizationKeys: ['size', 'fallback', 'stacking'],
    usage: usage(
      '@tuturuuu/ui/avatar',
      ['Avatar', 'AvatarFallback', 'AvatarImage'],
      `<Avatar>\n  <AvatarImage src="/avatar.png" alt="User" />\n  <AvatarFallback>TT</AvatarFallback>\n</Avatar>`
    ),
  },
  {
    id: 'badge',
    name: 'Badge',
    category: 'feedback',
    importPath: '@tuturuuu/ui/badge',
    exports: ['Badge'],
    customizationKeys: ['variant', 'tone', 'icon'],
    usage: usage(
      '@tuturuuu/ui/badge',
      ['Badge'],
      `<Badge variant="secondary">Beta</Badge>`
    ),
  },
  {
    id: 'breadcrumb',
    name: 'Breadcrumb',
    category: 'navigation',
    importPath: '@tuturuuu/ui/breadcrumb',
    exports: [
      'Breadcrumb',
      'BreadcrumbList',
      'BreadcrumbItem',
      'BreadcrumbLink',
    ],
    customizationKeys: ['separator', 'currentItem', 'overflow'],
    usage: usage(
      '@tuturuuu/ui/breadcrumb',
      ['Breadcrumb', 'BreadcrumbItem', 'BreadcrumbLink', 'BreadcrumbList'],
      `<Breadcrumb>\n  <BreadcrumbList>\n    <BreadcrumbItem><BreadcrumbLink href="/">Home</BreadcrumbLink></BreadcrumbItem>\n  </BreadcrumbList>\n</Breadcrumb>`
    ),
  },
  {
    id: 'button',
    name: 'Button',
    category: 'actions',
    importPath: '@tuturuuu/ui/button',
    exports: ['Button', 'buttonVariants'],
    customizationKeys: ['variant', 'size', 'icon'],
    usage: usage(
      '@tuturuuu/ui/button',
      ['Button'],
      `<Button variant="default" size="sm">Create workspace</Button>`
    ),
  },
  {
    id: 'calendar',
    name: 'Calendar',
    category: 'inputs',
    importPath: '@tuturuuu/ui/calendar',
    exports: ['Calendar'],
    customizationKeys: ['mode', 'timezone', 'weekStart'],
    usage: usage(
      '@tuturuuu/ui/calendar',
      ['Calendar'],
      `<Calendar mode="single" selected={date} onSelect={setDate} />`
    ),
  },
  {
    id: 'card',
    name: 'Card',
    category: 'layout',
    importPath: '@tuturuuu/ui/card',
    exports: [
      'Card',
      'CardHeader',
      'CardTitle',
      'CardDescription',
      'CardContent',
      'CardFooter',
    ],
    customizationKeys: ['header', 'content', 'footer'],
    usage: usage(
      '@tuturuuu/ui/card',
      ['Card', 'CardContent', 'CardHeader', 'CardTitle'],
      `<Card>\n  <CardHeader><CardTitle>Workspace</CardTitle></CardHeader>\n  <CardContent>Summary content</CardContent>\n</Card>`
    ),
  },
  {
    id: 'carousel',
    name: 'Carousel',
    category: 'layout',
    importPath: '@tuturuuu/ui/carousel',
    exports: [
      'Carousel',
      'CarouselContent',
      'CarouselItem',
      'CarouselNext',
      'CarouselPrevious',
    ],
    customizationKeys: ['orientation', 'slides', 'controls'],
    usage: usage(
      '@tuturuuu/ui/carousel',
      ['Carousel', 'CarouselContent', 'CarouselItem'],
      `<Carousel opts={{ align: 'start' }}>\n  <CarouselContent>\n    <CarouselItem>Slide content</CarouselItem>\n  </CarouselContent>\n</Carousel>`
    ),
  },
  {
    id: 'chart',
    name: 'Chart',
    category: 'data',
    importPath: '@tuturuuu/ui/chart',
    exports: ['ChartContainer', 'ChartTooltip', 'ChartTooltipContent'],
    customizationKeys: ['series', 'theme', 'tooltip'],
    usage: usage(
      '@tuturuuu/ui/chart',
      ['ChartContainer', 'ChartTooltip', 'ChartTooltipContent'],
      `<ChartContainer config={{ work: { label: 'Work', color: 'hsl(var(--primary))' } }}>\n  <BarChart data={data}>\n    <ChartTooltip content={<ChartTooltipContent />} />\n  </BarChart>\n</ChartContainer>`
    ),
  },
  {
    id: 'checkbox',
    name: 'Checkbox',
    category: 'inputs',
    importPath: '@tuturuuu/ui/checkbox',
    exports: ['Checkbox'],
    customizationKeys: ['checked', 'disabled', 'label'],
    usage: usage(
      '@tuturuuu/ui/checkbox',
      ['Checkbox'],
      `<Checkbox id="terms" defaultChecked />`
    ),
  },
  {
    id: 'codeblock',
    name: 'Code Block',
    category: 'typography',
    importPath: '@tuturuuu/ui/codeblock',
    exports: ['CodeBlock'],
    customizationKeys: ['language', 'theme', 'lineNumbers'],
    usage: usage(
      '@tuturuuu/ui/codeblock',
      ['CodeBlock'],
      `<CodeBlock language="tsx" value={"<Button>Save</Button>"} />`
    ),
    safePreview: false,
  },
  {
    id: 'collapsible',
    name: 'Collapsible',
    category: 'layout',
    importPath: '@tuturuuu/ui/collapsible',
    exports: ['Collapsible', 'CollapsibleTrigger', 'CollapsibleContent'],
    customizationKeys: ['openState', 'trigger', 'contentDensity'],
    usage: usage(
      '@tuturuuu/ui/collapsible',
      ['Collapsible', 'CollapsibleContent', 'CollapsibleTrigger'],
      `<Collapsible>\n  <CollapsibleTrigger>Toggle details</CollapsibleTrigger>\n  <CollapsibleContent>Hidden content</CollapsibleContent>\n</Collapsible>`
    ),
  },
  {
    id: 'color-picker',
    name: 'Color Picker',
    category: 'inputs',
    importPath: '@tuturuuu/ui/color-picker',
    exports: ['ColorPicker', 'ensureVisibleColor'],
    customizationKeys: ['value', 'contrast', 'disabled'],
    usage: usage(
      '@tuturuuu/ui/color-picker',
      ['ColorPicker'],
      `<ColorPicker value={color} onChange={setColor} />`
    ),
  },
  {
    id: 'command',
    name: 'Command',
    category: 'navigation',
    importPath: '@tuturuuu/ui/command',
    exports: ['Command', 'CommandInput', 'CommandItem', 'CommandList'],
    customizationKeys: ['groups', 'emptyState', 'shortcuts'],
    usage: usage(
      '@tuturuuu/ui/command',
      ['Command', 'CommandInput', 'CommandItem', 'CommandList'],
      `<Command>\n  <CommandInput placeholder="Search..." />\n  <CommandList><CommandItem>Open dashboard</CommandItem></CommandList>\n</Command>`
    ),
  },
  {
    id: 'context-menu',
    name: 'Context Menu',
    category: 'overlays',
    importPath: '@tuturuuu/ui/context-menu',
    exports: ['ContextMenu', 'ContextMenuTrigger', 'ContextMenuContent'],
    customizationKeys: ['items', 'shortcuts', 'dangerZone'],
    usage: usage(
      '@tuturuuu/ui/context-menu',
      [
        'ContextMenu',
        'ContextMenuContent',
        'ContextMenuItem',
        'ContextMenuTrigger',
      ],
      `<ContextMenu>\n  <ContextMenuTrigger>Right click area</ContextMenuTrigger>\n  <ContextMenuContent><ContextMenuItem>Duplicate</ContextMenuItem></ContextMenuContent>\n</ContextMenu>`
    ),
  },
  {
    id: 'currency-input',
    name: 'Currency Input',
    category: 'inputs',
    importPath: '@tuturuuu/ui/currency-input',
    exports: ['CurrencyInput'],
    customizationKeys: ['locale', 'symbol', 'helpers'],
    usage: usage(
      '@tuturuuu/ui/currency-input',
      ['CurrencyInput'],
      `<CurrencyInput value={amount} onChange={setAmount} currencySymbol="$" />`
    ),
  },
  {
    id: 'date-time-picker',
    name: 'Date Time Picker',
    category: 'inputs',
    importPath: '@tuturuuu/ui/date-time-picker',
    exports: ['DateTimePicker'],
    customizationKeys: ['timezone', 'timeFormat', 'inline'],
    usage: usage(
      '@tuturuuu/ui/date-time-picker',
      ['DateTimePicker'],
      `<DateTimePicker date={date} setDate={setDate} showTimeSelect />`
    ),
  },
  {
    id: 'optional-time-picker',
    name: 'Optional Time Picker',
    category: 'inputs',
    importPath: '@tuturuuu/ui/optional-time-picker',
    exports: ['OptionalTimePicker'],
    customizationKeys: ['includeTime', 'timezone', 'timeFormat', 'disabled'],
    usage: usage(
      '@tuturuuu/ui/optional-time-picker',
      ['OptionalTimePicker'],
      `<OptionalTimePicker\n  date={date}\n  setDate={setDate}\n  includeTime={includeTime}\n  setIncludeTime={setIncludeTime}\n  includeTimeLabel="Include time"\n/>`
    ),
  },
  {
    id: 'dialog',
    name: 'Dialog',
    category: 'overlays',
    importPath: '@tuturuuu/ui/dialog',
    exports: ['Dialog', 'DialogTrigger', 'DialogContent', 'DialogHeader'],
    customizationKeys: ['size', 'trigger', 'footer'],
    usage: usage(
      '@tuturuuu/ui/dialog',
      ['Dialog', 'DialogContent', 'DialogTrigger'],
      `<Dialog>\n  <DialogTrigger>Open</DialogTrigger>\n  <DialogContent>Dialog content</DialogContent>\n</Dialog>`
    ),
  },
  {
    id: 'diff-viewer',
    name: 'Diff Viewer',
    category: 'data',
    importPath: '@tuturuuu/ui/diff-viewer',
    exports: ['DiffViewer'],
    customizationKeys: ['viewMode', 'granularity', 'lineNumbers'],
    usage: usage(
      '@tuturuuu/ui/diff-viewer',
      ['DiffViewer'],
      `<DiffViewer oldValue={oldText} newValue={newText} wrapper="inline" />`
    ),
  },
  {
    id: 'drawer',
    name: 'Drawer',
    category: 'overlays',
    importPath: '@tuturuuu/ui/drawer',
    exports: ['Drawer', 'DrawerTrigger', 'DrawerContent'],
    customizationKeys: ['direction', 'snapPoints', 'handle'],
    usage: usage(
      '@tuturuuu/ui/drawer',
      ['Drawer', 'DrawerContent', 'DrawerTrigger'],
      `<Drawer>\n  <DrawerTrigger>Open drawer</DrawerTrigger>\n  <DrawerContent>Drawer content</DrawerContent>\n</Drawer>`
    ),
  },
  {
    id: 'dropdown-menu',
    name: 'Dropdown Menu',
    category: 'overlays',
    importPath: '@tuturuuu/ui/dropdown-menu',
    exports: ['DropdownMenu', 'DropdownMenuTrigger', 'DropdownMenuContent'],
    customizationKeys: ['items', 'checkboxItems', 'shortcuts'],
    usage: usage(
      '@tuturuuu/ui/dropdown-menu',
      [
        'DropdownMenu',
        'DropdownMenuContent',
        'DropdownMenuItem',
        'DropdownMenuTrigger',
      ],
      `<DropdownMenu>\n  <DropdownMenuTrigger>Open menu</DropdownMenuTrigger>\n  <DropdownMenuContent><DropdownMenuItem>Settings</DropdownMenuItem></DropdownMenuContent>\n</DropdownMenu>`
    ),
  },
  {
    id: 'form',
    name: 'Form',
    category: 'inputs',
    importPath: '@tuturuuu/ui/form',
    exports: [
      'Form',
      'FormField',
      'FormItem',
      'FormLabel',
      'FormControl',
      'FormMessage',
    ],
    customizationKeys: ['validation', 'required', 'description'],
    usage: usage(
      '@tuturuuu/ui/form',
      ['Form', 'FormControl', 'FormField', 'FormItem', 'FormLabel'],
      `<Form {...form}>\n  <FormField name="name" render={({ field }) => (\n    <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>\n  )} />\n</Form>`
    ),
  },
  {
    id: 'form-required-indicator',
    name: 'Form Required Indicator',
    category: 'inputs',
    importPath: '@tuturuuu/ui/form-required-indicator',
    exports: ['FormRequiredIndicator'],
    customizationKeys: ['label', 'required', 'a11y'],
    usage: usage(
      '@tuturuuu/ui/form-required-indicator',
      ['FormRequiredIndicator'],
      `<Label>Name <FormRequiredIndicator /></Label>`
    ),
  },
  {
    id: 'hover-card',
    name: 'Hover Card',
    category: 'overlays',
    importPath: '@tuturuuu/ui/hover-card',
    exports: ['HoverCard', 'HoverCardTrigger', 'HoverCardContent'],
    customizationKeys: ['delay', 'side', 'content'],
    usage: usage(
      '@tuturuuu/ui/hover-card',
      ['HoverCard', 'HoverCardContent', 'HoverCardTrigger'],
      `<HoverCard>\n  <HoverCardTrigger>Hover profile</HoverCardTrigger>\n  <HoverCardContent>Profile summary</HoverCardContent>\n</HoverCard>`
    ),
  },
  ...foundationInputComponentEntries,
];
