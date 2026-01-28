import * as z from 'zod';

export const InventorySchema = z.object({
  unit_id: z.string(),
  warehouse_id: z.string(),
  amount: z.coerce.number(),
  min_amount: z.coerce.number(),
  price: z.coerce.number(),
});

export const EditProductSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  manufacturer: z.string().optional(),
  description: z.string().optional(),
  usage: z.string().optional(),
  category_id: z.string().optional(),
  inventory: z.array(InventorySchema).optional(),
});
