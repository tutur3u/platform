'use client';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { Transaction } from '@/types/primitives/Transaction';
import { TransactionCategory } from '@/types/primitives/TransactionCategory';
import { Wallet } from '@/types/primitives/Wallet';
import { fetcher } from '@/utils/fetcher';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { CalendarIcon, CheckIcon, ChevronsUpDown } from 'lucide-react';
import useTranslation from 'next-translate/useTranslation';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import useSWR from 'swr';
import * as z from 'zod';

interface Props {
  wsId: string;
  data?: Transaction;
  onComplete?: () => void;
  submitLabel?: string;
}

const FormSchema = z.object({
  description: z.string(),
  amount: z.number().positive(),
  origin_wallet_id: z.string().uuid(),
  destination_wallet_id: z.string().uuid().optional(),
  category_id: z.string().uuid(),
  taken_at: z.date(),
  report_opt_in: z.boolean(),
});

export function TransactionForm({
  wsId,
  data,
  onComplete,
  submitLabel,
}: Props) {
  const { t } = useTranslation('common');

  // const [mode, setMode] = useState<'standard' | 'transfer'>('standard');

  const [showCategories, setShowCategories] = useState(false);
  const [showWallets, setShowWallets] = useState(false);

  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const { data: categories, error: categoriesError } = useSWR<
    TransactionCategory[]
  >(`/api/workspaces/${wsId}/transactions/categories`, fetcher);

  const categoriesLoading = !categories && !categoriesError;

  const { data: wallets, error: walletsError } = useSWR<Wallet[]>(
    `/api/workspaces/${wsId}/wallets`,
    fetcher
  );

  const walletsLoading = !wallets && !walletsError;

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      description: data?.description || '',
      amount: data?.amount ? Math.abs(data.amount) : undefined,
      origin_wallet_id: data?.wallet_id || wallets?.[0]?.id || '',
      category_id: data?.category_id || '',
      taken_at: data?.taken_at ? new Date(data.taken_at) : new Date(),
      report_opt_in: data?.report_opt_in || true,
    },
  });

  async function onSubmit(formData: z.infer<typeof FormSchema>) {
    setLoading(true);

    const res = await fetch(
      data?.id
        ? `/api/workspaces/${wsId}/transactions/${data.id}`
        : `/api/workspaces/${wsId}/transactions`,
      {
        method: data?.id ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          amount:
            categories?.find((c) => c.id === formData.category_id)
              ?.is_expense === false
              ? Math.abs(formData.amount)
              : -Math.abs(formData.amount),
        }),
      }
    );

    if (res.ok) {
      router.refresh();
      if (onComplete) onComplete();
    } else {
      setLoading(false);
      toast({
        title: 'Error creating category',
        description: 'An error occurred while creating the category',
      });
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col space-y-2"
      >
        <FormField
          control={form.control}
          name="origin_wallet_id"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Wallet</FormLabel>
              <Popover open={showWallets} onOpenChange={setShowWallets}>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant="outline"
                      role="combobox"
                      className={cn(
                        'justify-between',
                        !field.value && 'text-muted-foreground'
                      )}
                      // disabled={walletsLoading}
                      disabled
                    >
                      {field.value
                        ? wallets?.find((c) => c.id === field.value)?.name
                        : walletsLoading
                          ? 'Fetching...'
                          : 'Select wallet'}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0">
                  <Command
                    filter={(value, search) => {
                      if (value.includes(search)) return 1;
                      return 0;
                    }}
                  >
                    <CommandInput
                      placeholder="Search wallet..."
                      disabled={walletsLoading}
                    />
                    <CommandEmpty>No wallet found.</CommandEmpty>
                    <CommandGroup>
                      {(wallets?.length || 0) > 0
                        ? wallets?.map((wallet) => (
                            <CommandItem
                              key={wallet.id}
                              value={wallet.name}
                              onSelect={() => {
                                form.setValue(
                                  'origin_wallet_id',
                                  wallet?.id || ''
                                );
                                setShowWallets(false);
                              }}
                            >
                              <CheckIcon
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  wallet.id === field.value
                                    ? 'opacity-100'
                                    : 'opacity-0'
                                )}
                              />
                              {wallet.name}
                            </CommandItem>
                          ))
                        : null}
                    </CommandGroup>
                  </Command>
                </PopoverContent>
              </Popover>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="category_id"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Category</FormLabel>
              <Popover open={showCategories} onOpenChange={setShowCategories}>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant="outline"
                      role="combobox"
                      className={cn(
                        'justify-between',
                        !field.value && 'text-muted-foreground'
                      )}
                      disabled={categoriesLoading}
                    >
                      {field.value
                        ? categories?.find((c) => c.id === field.value)?.name
                        : categoriesLoading
                          ? 'Fetching...'
                          : 'Select category'}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0">
                  <Command
                    filter={(value, search) => {
                      if (value.includes(search)) return 1;
                      return 0;
                    }}
                  >
                    <CommandInput
                      placeholder="Search category..."
                      disabled={categoriesLoading}
                    />
                    <CommandEmpty>No category found.</CommandEmpty>
                    <CommandList>
                      <CommandGroup>
                        {(categories?.length || 0) > 0
                          ? categories?.map((category) => (
                              <CommandItem
                                key={category.id}
                                value={category.name}
                                onSelect={() => {
                                  form.setValue(
                                    'category_id',
                                    category?.id || ''
                                  );
                                  setShowCategories(false);
                                }}
                              >
                                <CheckIcon
                                  className={cn(
                                    'mr-2 h-4 w-4',
                                    category.id === field.value
                                      ? 'opacity-100'
                                      : 'opacity-0'
                                  )}
                                />
                                {category.name}
                              </CommandItem>
                            ))
                          : null}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="h-2" />
        <Separator />
        <div className="h-2" />

        <FormField
          control={form.control}
          name="amount"
          disabled={loading}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Amount</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="0"
                  {...field}
                  value={Math.abs(field.value)}
                  onChange={(e) => field.onChange(parseFloat(e.target.value))}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          disabled={loading}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Input placeholder="Description" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="h-2" />
        <Separator />
        <div className="h-2" />

        <FormField
          control={form.control}
          name="taken_at"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Taken at</FormLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant={'outline'}
                      className={cn(
                        'pl-3 text-left font-normal',
                        !field.value && 'text-muted-foreground'
                      )}
                    >
                      {field.value ? (
                        format(field.value, 'PPP')
                      ) : (
                        <span>Pick a date</span>
                      )}
                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="center">
                  <Calendar
                    mode="single"
                    selected={field.value}
                    onSelect={field.onChange}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="h-2" />

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? t('common:processing') : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
