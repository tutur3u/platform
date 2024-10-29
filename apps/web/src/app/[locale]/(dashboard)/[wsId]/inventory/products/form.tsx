'use client';

import { Product } from '@/types/primitives/Product';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@repo/ui/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@repo/ui/components/ui/form';
import { Input } from '@repo/ui/components/ui/input';
import { ScrollArea } from '@repo/ui/components/ui/scroll-area';
import { Textarea } from '@repo/ui/components/ui/textarea';
import { toast } from '@repo/ui/hooks/use-toast';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

interface Props {
  wsId: string;
  data?: Product;
  onFinish?: (data: z.infer<typeof FormSchema>) => void;
}

const FormSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(255),
  manufacturer: z.string().optional(),
  description: z.string().optional(),
  usage: z.string().optional(),
  stock: z.number().optional(),
  amount: z.number().optional(),
  price: z.number().optional(),
  unit: z.string().optional(),
  category: z.string().optional(),
  category_id: z.string().optional(),
  warehouse_id: z.string().optional(),
  batch_id: z.string().optional(),
  unit_id: z.string().optional(),
});

export function ProductForm({ wsId, data, onFinish }: Props) {
  const t = useTranslations();

  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      id: data?.id,
      name: data?.name || '',
      manufacturer: data?.manufacturer || '',
      description: data?.description || '',
      usage: data?.usage || '',
      stock: data?.stock ? Number(data.stock) : undefined,
      amount: data?.amount ? Number(data.amount) : undefined,
      price: data?.price ? Number(data.price) : undefined,
      unit: data?.unit || '',
      category: data?.category || '',
      category_id: data?.category_id || '',
      warehouse_id: data?.warehouse_id || '',
      batch_id: data?.batch_id || '',
      unit_id: data?.unit_id || '',
    },
  });

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    setLoading(true);

    const res = await fetch(
      data?.id
        ? `/api/workspaces/${wsId}/products/${data.id}`
        : `/api/workspaces/${wsId}/products`,
      {
        method: data?.id ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      }
    );

    if (res.ok) {
      onFinish?.(data);
      router.refresh();
    } else {
      setLoading(false);
      toast({
        title: 'Error creating product',
        description: 'An error occurred while creating the product',
      });
    }
  }

  return (
    <ScrollArea className="h-[400px] w-full">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('product-data-table.name')}</FormLabel>
                <FormControl>
                  <Input placeholder="Product name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="manufacturer"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('product-data-table.manufacturer')}</FormLabel>
                <FormControl>
                  <Input placeholder="Manufacturer" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('product-data-table.description')}</FormLabel>
                <FormControl>
                  <Textarea placeholder="Description" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="usage"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('product-data-table.usage')}</FormLabel>
                <FormControl>
                  <Textarea placeholder="Usage" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex gap-4">
            <FormField
              control={form.control}
              name="stock"
              render={({ field }) => (
                <FormItem className="flex-1">
                  <FormLabel>{t('product-data-table.stock')}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="0"
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="flex gap-4">
            <FormField
              control={form.control}
              name="unit"
              render={({ field }) => (
                <FormItem className="flex-1">
                  <FormLabel>{t('product-data-table.unit')}</FormLabel>
                  <FormControl>
                    <Input placeholder="Unit" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem className="flex-1">
                  <FormLabel>{t('product-data-table.category')}</FormLabel>
                  <FormControl>
                    <Input placeholder="Category" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="flex gap-4">
            <FormField
              control={form.control}
              name="warehouse_id"
              render={({ field }) => (
                <FormItem className="flex-1">
                  <FormLabel>{t('product-data-table.warehouse')}</FormLabel>
                  <FormControl>
                    <Input placeholder="Warehouse ID" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading
              ? t('common.processing')
              : !!data?.id
                ? t('common.edit')
                : t('common.create')}
          </Button>
        </form>
      </Form>
    </ScrollArea>
  );
}
