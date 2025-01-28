'use client';

import { ProductCategoryForm } from '../../categories/form';
import { ProductWarehouseForm } from '../../warehouses/form';
import { cn } from '@/lib/utils';
import { ProductCategory } from '@/types/primitives/ProductCategory';
import { ProductUnit } from '@/types/primitives/ProductUnit';
import { ProductWarehouse } from '@/types/primitives/ProductWarehouse';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@repo/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@repo/ui/components/ui/card';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@repo/ui/components/ui/command';
import ModifiableDialogTrigger from '@repo/ui/components/ui/custom/modifiable-dialog-trigger';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@repo/ui/components/ui/form';
import { Input } from '@repo/ui/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@repo/ui/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/components/ui/select';
import { Separator } from '@repo/ui/components/ui/separator';
import { Textarea } from '@repo/ui/components/ui/textarea';
import { toast } from '@repo/ui/hooks/use-toast';
import { Check, ChevronsUpDown, Plus, Trash } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import * as z from 'zod';

const InventorySchema = z.object({
  unit_id: z.string(),
  warehouse_id: z.string(),
  amount: z.coerce.number(),
  min_amount: z.coerce.number(),
  price: z.coerce.number(),
});

const FormSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(255),
  manufacturer: z.string().optional(),
  description: z.string().optional(),
  usage: z.string().optional(),
  category_id: z.string(),
  inventory: z.array(InventorySchema).optional(),
});

interface Props {
  wsId: string;
  data?: z.output<typeof FormSchema>;
  categories: ProductCategory[];
  warehouses: ProductWarehouse[];
  units: ProductUnit[];
  onFinish?: (data: z.infer<typeof FormSchema>) => void;
}

export function ProductForm({
  wsId,
  data,
  categories,
  warehouses,
  units,
  onFinish,
}: Props) {
  const t = useTranslations();

  const [loading, setLoading] = useState(false);
  const [showCategoryDialog, setCategoryDialog] = useState(false);
  const [showWarehouseDialog, setWarehouseDialog] = useState(false);
  const router = useRouter();

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      ...data,
      manufacturer: data?.manufacturer ?? '',
      description: data?.description ?? '',
      usage: data?.usage ?? '',
      inventory: data?.inventory || [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    name: 'inventory',
    control: form.control,
  });

  function addStock() {
    append({
      unit_id: '',
      warehouse_id: '',
      min_amount: 0,
      amount: 0,
      price: 0,
    });
  }

  function removeStock(index: number) {
    remove(index);
  }

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    setLoading(true);

    const res = await fetch(
      data?.id
        ? `/api/v1/workspaces/${wsId}/products/${data.id}`
        : `/api/v1/workspaces/${wsId}/products`,
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
      setLoading(false);
      router.push('../products');
    } else {
      setLoading(false);
      toast({
        title: 'Error creating product',
        description: 'An error occurred while creating the product',
      });
    }
  }

  return (
    <>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-4 lg:flex-row"
        >
          <div className="flex-1 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{t('ws-inventory-products.form.details')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t('ws-inventory-products.form.name')}
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t('ws-inventory-products.form.name')}
                            {...field}
                          />
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
                        <FormLabel>
                          {t('ws-inventory-products.form.manufacturer')}
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t(
                              'ws-inventory-products.form.manufacturer'
                            )}
                            {...field}
                          />
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
                        <FormLabel>
                          {t('ws-inventory-products.form.description')}
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder={t(
                              'ws-inventory-products.form.description'
                            )}
                            {...field}
                          />
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
                        <FormLabel>
                          {t('ws-inventory-products.form.usage')}
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder={t('ws-inventory-products.form.usage')}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('ws-inventory-products.form.stock')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4">
                  {fields.map((_, i) => (
                    <div key={i} className="grid gap-4">
                      <FormField
                        control={form.control}
                        name={`inventory.${i}.warehouse_id`}
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormLabel>
                              {t('ws-inventory-warehouses.singular')}
                            </FormLabel>
                            <Popover>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant="outline"
                                    role="combobox"
                                    className="w-full justify-between"
                                  >
                                    {field.value
                                      ? warehouses.find(
                                          (warehouse) =>
                                            warehouse.id === field.value
                                        )?.name
                                      : t(
                                          'ws-inventory-warehouses.placeholder'
                                        )}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="p-0">
                                <Command>
                                  <CommandInput placeholder="Search warehouse..." />
                                  <CommandList>
                                    <CommandEmpty>
                                      Warehouse {field.value} not found.
                                    </CommandEmpty>
                                    <CommandGroup>
                                      <CommandItem
                                        onSelect={() =>
                                          setWarehouseDialog(true)
                                        }
                                      >
                                        <Plus className="mr-2 h-4 w-4" />
                                        Create new warehouse
                                      </CommandItem>
                                    </CommandGroup>
                                    <CommandSeparator />
                                    <CommandGroup>
                                      {warehouses.map((warehouse) => (
                                        <CommandItem
                                          value={warehouse.id}
                                          key={warehouse.id}
                                          onSelect={() => {
                                            form.setValue(
                                              `inventory.${i}.warehouse_id`,
                                              warehouse.id
                                            );
                                          }}
                                        >
                                          <Check
                                            className={cn(
                                              'mr-2 h-4 w-4',
                                              warehouse.id === field.value
                                                ? 'opacity-100'
                                                : 'opacity-0'
                                            )}
                                          />
                                          {warehouse.name}
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`inventory.${i}.price`}
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormLabel>
                              {t('ws-inventory-products.form.price')}
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                placeholder={t(
                                  'ws-inventory-products.form.price'
                                )}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-3 gap-4">
                        <FormField
                          control={form.control}
                          name={`inventory.${i}.min_amount`}
                          render={({ field }) => (
                            <FormItem className="flex-1">
                              <FormLabel>
                                {t('ws-inventory-products.form.min_amount')}
                              </FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  placeholder={t(
                                    'ws-inventory-products.form.min_amount'
                                  )}
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`inventory.${i}.amount`}
                          render={({ field }) => (
                            <FormItem className="flex-1">
                              <FormLabel>
                                {t('ws-inventory-products.form.amount')}
                              </FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  placeholder={t(
                                    'ws-inventory-products.form.amount'
                                  )}
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`inventory.${i}.unit_id`}
                          render={({ field }) => (
                            <FormItem className="flex-1">
                              <FormLabel>
                                {t('ws-inventory-units.singular')}
                              </FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger
                                    id="status"
                                    aria-label={t(
                                      'ws-inventory-units.placeholder'
                                    )}
                                  >
                                    <SelectValue
                                      placeholder={t(
                                        'ws-inventory-units.placeholder'
                                      )}
                                    />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {units.map((unit) => (
                                    <SelectItem value={unit.id} key={unit.id}>
                                      {unit.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="text-right">
                        <Button
                          type="button"
                          size="icon"
                          variant="destructive"
                          onClick={() => {
                            removeStock(i);
                          }}
                        >
                          <Trash />
                          <span className="sr-only">Remove stock option</span>
                        </Button>
                      </div>

                      <Separator />
                    </div>
                  ))}

                  <Button
                    type="button"
                    className="w-full"
                    disabled={loading}
                    onClick={addStock}
                  >
                    Add stock
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="w-full shrink-0 space-y-4 lg:max-w-sm">
            <Card>
              <CardHeader>
                <CardTitle>
                  {t('ws-inventory-products.form.category')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4">
                  <FormField
                    control={form.control}
                    name="category_id"
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormLabel>
                          {t('ws-inventory-categories.singular')}
                        </FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                role="combobox"
                                className="w-full justify-between"
                              >
                                {field.value
                                  ? categories.find(
                                      (category) => category.id === field.value
                                    )?.name
                                  : t('ws-inventory-categories.placeholder')}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="p-0">
                            <Command>
                              <CommandInput placeholder="Search category..." />
                              <CommandList>
                                <CommandEmpty>
                                  Category {field.value} not found.
                                </CommandEmpty>
                                <CommandGroup>
                                  <CommandItem
                                    onSelect={() => setCategoryDialog(true)}
                                  >
                                    <Plus className="mr-2 h-4 w-4" />
                                    Create new category
                                  </CommandItem>
                                </CommandGroup>
                                <CommandSeparator />
                                <CommandGroup>
                                  {categories.map((category) => (
                                    <CommandItem
                                      value={category.name}
                                      key={category.id}
                                      onSelect={() => {
                                        form.setValue(
                                          'category_id',
                                          category.id
                                        );
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          'mr-2 h-4 w-4',
                                          category.id === field.value
                                            ? 'opacity-100'
                                            : 'opacity-0'
                                        )}
                                      />
                                      {category.name}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading
                ? t('common.processing')
                : data?.id
                  ? t('common.edit')
                  : t('common.create')}
            </Button>
          </div>
        </form>
      </Form>

      <ModifiableDialogTrigger
        data={data}
        open={showCategoryDialog}
        title={t('ws-product-categories.create')}
        editDescription={t('ws-product-categories.create_description')}
        setOpen={setCategoryDialog}
        form={<ProductCategoryForm wsId={wsId} />}
      />

      <ModifiableDialogTrigger
        data={data}
        open={showWarehouseDialog}
        title={t('ws-product-warehouses.create')}
        editDescription={t('ws-product-warehouses.create_description')}
        setOpen={setWarehouseDialog}
        form={<ProductWarehouseForm wsId={wsId} />}
      />
    </>
  );
}
