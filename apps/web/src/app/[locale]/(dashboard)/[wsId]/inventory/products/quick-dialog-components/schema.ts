import * as z from 'zod';

const InventorySchema = z.object({
  unit_id: z.string().min(1, 'Unit is required'),
  warehouse_id: z.string().min(1, 'Warehouse is required'),
  amount: z.number().min(0).nullable(),
  min_amount: z.number().min(0).nullable(),
  price: z.number().min(0, 'Price is required'),
});

export const EditProductSchema = z
  .object({
    name: z.string().min(1, 'Product name is required'),
    manufacturer: z.string().optional(),
    description: z.string().optional(),
    usage: z.string().optional(),
    category_id: z.string().optional(),
    inventory: z.array(InventorySchema).optional(),
  })
  .superRefine((values, ctx) => {
    const inventory = values.inventory ?? [];
    const seen = new Set<string>();
    inventory.forEach((item, index) => {
      if (!item.unit_id || !item.warehouse_id) return;
      const key = `${item.warehouse_id}-${item.unit_id}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Warehouse and unit combination must be unique',
          path: ['inventory', index, 'unit_id'],
        });
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Warehouse and unit combination must be unique',
          path: ['inventory', index, 'warehouse_id'],
        });
      } else {
        seen.add(key);
      }
    });
  });

export type EditProductFormValues = z.infer<typeof EditProductSchema>;
