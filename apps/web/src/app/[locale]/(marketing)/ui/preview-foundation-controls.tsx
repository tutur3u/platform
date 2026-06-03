'use client';

import { Circle } from '@tuturuuu/icons';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@tuturuuu/ui/chart';
import { ColorPicker } from '@tuturuuu/ui/color-picker';
import { CurrencyInput } from '@tuturuuu/ui/currency-input';
import { DateTimePicker } from '@tuturuuu/ui/date-time-picker';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from '@tuturuuu/ui/form';
import { Input } from '@tuturuuu/ui/input';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Bar, BarChart, XAxis } from 'recharts';

type SampleTranslator = (key: string) => string;

export function ChartPreview() {
  return (
    <ChartContainer
      className="h-40 w-full"
      config={{ value: { color: 'hsl(var(--primary))', label: 'Value' } }}
    >
      <BarChart
        data={[
          { name: 'A', value: 34 },
          { name: 'B', value: 58 },
          { name: 'C', value: 42 },
        ]}
      >
        <XAxis dataKey="name" hide />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="value" fill="var(--color-value)" radius={6} />
      </BarChart>
    </ChartContainer>
  );
}

export function ColorPickerPreview() {
  const [color, setColor] = useState('#2563eb');
  return (
    <div className="flex items-center gap-3">
      <ColorPicker value={color} onChange={setColor} />
      <div
        className="h-10 w-24 rounded-md border"
        style={{ backgroundColor: color }}
      />
    </div>
  );
}

export function CurrencyInputPreview() {
  const [amount, setAmount] = useState(1280);
  return (
    <CurrencyInput
      currencySuffix="USD"
      currencySymbol="$"
      hideHelpers
      onChange={setAmount}
      value={amount}
    />
  );
}

export function DateTimePickerPreview() {
  const [date, setDate] = useState<Date | undefined>(
    new Date(2026, 5, 3, 9, 30)
  );
  return (
    <DateTimePicker
      date={date}
      preferences={{ timeFormat: '24h', weekStartsOn: 1 }}
      setDate={setDate}
    />
  );
}

export function FormPreview({ s }: { s: SampleTranslator }) {
  const form = useForm({
    defaultValues: { workspace: s('workspacePlaceholder') },
  });
  return (
    <div className="grid gap-2">
      <Form {...form}>
        <FormField
          control={form.control}
          name="workspace"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{s('workspaceName')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormDescription>{s('formDescription')}</FormDescription>
            </FormItem>
          )}
        />
      </Form>
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <Circle className="h-3 w-3 fill-current" />
        {s('validated')}
      </div>
    </div>
  );
}
