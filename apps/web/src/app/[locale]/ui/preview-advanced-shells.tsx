'use client';

import { FileText, Menu, PanelLeft } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Kbd } from '@tuturuuu/ui/kbd';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { Textarea } from '@tuturuuu/ui/textarea';
import { TimePickerInput } from '@tuturuuu/ui/time-picker-input';
import { useState } from 'react';

type SampleTranslator = (key: string) => string;

export function StaticNavShell({ s }: { s: SampleTranslator }) {
  return (
    <div className="flex w-full items-center justify-between rounded-lg border bg-background px-3 py-2 shadow-sm">
      <div className="flex items-center gap-2 font-semibold">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs">
          T
        </div>
        Tuturuuu
      </div>
      <div className="hidden items-center gap-3 text-muted-foreground text-sm sm:flex">
        <span>{s('docs')}</span>
        <span>{s('components')}</span>
      </div>
      <Button size="sm" variant="secondary">
        {s('login')}
      </Button>
    </div>
  );
}

export function ReportProblemShell({ s }: { s: SampleTranslator }) {
  return (
    <div className="grid w-full gap-3 rounded-lg border p-3">
      <div className="flex items-center gap-2 font-medium text-sm">
        <FileText className="h-4 w-4" />
        {s('reportProblem')}
      </div>
      <Input readOnly value={s('webProduct')} />
      <Textarea readOnly rows={2} value={s('reportCopy')} />
    </div>
  );
}

export function SidebarShell({ s }: { s: SampleTranslator }) {
  return (
    <div className="grid w-full grid-cols-[9rem_1fr] overflow-hidden rounded-lg border">
      <div className="grid gap-2 border-r bg-muted/40 p-2">
        <Button className="justify-start" size="sm" variant="secondary">
          <PanelLeft />
          {s('dashboard')}
        </Button>
        <Button className="justify-start" size="sm" variant="ghost">
          <Menu />
          {s('settings')}
        </Button>
      </div>
      <div className="grid gap-2 p-3">
        <div className="h-4 w-24 rounded bg-muted" />
        <div className="h-16 rounded bg-muted/60" />
      </div>
    </div>
  );
}

export function StickyBottomShell({ s }: { s: SampleTranslator }) {
  return (
    <div className="flex w-full items-center justify-between rounded-lg border bg-background p-3 shadow-sm">
      <div className="flex items-center gap-2 text-sm">
        <span className="h-2 w-2 rounded-full bg-primary" />
        {s('unsavedChanges')}
      </div>
      <Button size="sm">{s('save')}</Button>
    </div>
  );
}

export function TablePreview({ s }: { s: SampleTranslator }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{s('component')}</TableHead>
          <TableHead>{s('status')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>{s('button')}</TableCell>
          <TableCell>{s('stable')}</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>{s('sheet')}</TableCell>
          <TableCell>{s('active')}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

export function TimePickerPreview() {
  const [date, setDate] = useState<Date | undefined>(
    new Date(2026, 5, 3, 9, 30)
  );
  return (
    <div className="flex items-center gap-2">
      <TimePickerInput date={date} picker="hours" setDate={setDate} />
      <span className="text-muted-foreground">:</span>
      <TimePickerInput date={date} picker="minutes" setDate={setDate} />
    </div>
  );
}

export function ToasterShell({ s }: { s: SampleTranslator }) {
  return (
    <div className="grid w-full gap-2 rounded-lg border bg-background p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="font-medium text-sm">{s('notificationStack')}</div>
        <Kbd>3</Kbd>
      </div>
      <div className="text-muted-foreground text-sm">{s('toasterCopy')}</div>
    </div>
  );
}
