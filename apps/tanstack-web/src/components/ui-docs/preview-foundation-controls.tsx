'use client';

import { Circle, Search } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { useState } from 'react';

type SampleTranslator = (key: string) => string;

export function ChartPreview() {
  return (
    <div className="flex h-40 w-full items-end gap-3 rounded-lg border bg-muted/30 p-4">
      {[34, 58, 42].map((value) => (
        <div
          className="w-full rounded-t-md bg-primary/80"
          key={value}
          style={{ height: `${value * 1.8}px` }}
        />
      ))}
    </div>
  );
}

export function ColorPickerPreview() {
  const [color, setColor] = useState('#2563eb');
  return (
    <div className="flex items-center gap-3">
      <Input
        aria-label="Color"
        className="w-32 font-mono"
        onChange={(event) => setColor(event.target.value)}
        value={color}
      />
      <div
        className="h-10 w-24 rounded-md border"
        style={{ backgroundColor: color }}
      />
    </div>
  );
}

export function CurrencyInputPreview() {
  const [amount, setAmount] = useState('1280');
  return (
    <div className="flex max-w-xs items-center rounded-md border bg-background">
      <span className="px-3 text-muted-foreground">$</span>
      <Input
        aria-label="Amount"
        className="border-0"
        inputMode="decimal"
        onChange={(event) => setAmount(event.target.value)}
        value={amount}
      />
      <span className="px-3 text-muted-foreground text-sm">USD</span>
    </div>
  );
}

export function DateTimePickerPreview() {
  return <Input className="max-w-xs" type="datetime-local" />;
}

export function OptionalTimePickerPreview({ s }: { s: SampleTranslator }) {
  const [includeTime, setIncludeTime] = useState(true);

  return (
    <div className="grid w-full max-w-sm gap-3">
      <label className="flex items-center justify-between rounded-lg border p-3 text-sm">
        {s('includeTime')}
        <Switch checked={includeTime} onCheckedChange={setIncludeTime} />
      </label>
      <Input type={includeTime ? 'datetime-local' : 'date'} />
    </div>
  );
}

export function QuickCommandCenterPreview({ s }: { s: SampleTranslator }) {
  const [query, setQuery] = useState('');

  return (
    <div className="grid w-full max-w-sm gap-2 rounded-lg border bg-card p-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={s('searchPlaceholder')}
          value={query}
        />
      </div>
      {[s('openDashboard'), s('createTask')].map((item) => (
        <Button className="justify-start" key={item} size="sm" variant="ghost">
          {item}
        </Button>
      ))}
    </div>
  );
}

export function FormPreview({ s }: { s: SampleTranslator }) {
  return (
    <div className="grid gap-2">
      <div className="grid gap-2">
        <Label htmlFor="ui-docs-workspace-name">{s('workspaceName')}</Label>
        <Input
          defaultValue={s('workspacePlaceholder')}
          id="ui-docs-workspace-name"
        />
        <p className="text-muted-foreground text-sm">{s('formDescription')}</p>
      </div>
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <Circle className="h-3 w-3 fill-current" />
        {s('validated')}
      </div>
    </div>
  );
}
