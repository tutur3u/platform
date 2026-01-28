import * as z from 'zod';

export const InventorySchema = z.object({
  unit_id: z.string(),
  warehouse_id: z.string(),
  amount: z.number(),
  min_amount: z.number(),
  price: z.number(),
});

export const EditProductSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  manufacturer: z.string().optional(),
  description: z.string().optional(),
  usage: z.string().optional(),
  category_id: z.string().optional(),
  inventory: z.array(InventorySchema).optional(),
});

export type EditProductFormValues = z.infer<typeof EditProductSchema>;
