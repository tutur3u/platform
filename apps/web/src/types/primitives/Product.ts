import { CategoryType } from "./Category";

export interface Product {
  id: string;
  name?: string;
  manufacturer?: string;
  description?: string;
  usage?: string;
  stock?: number | '';
  amount?: number | '';
  price?: number | '';
  unit?: string;
  category?: string;
  category_id?: string;
  warehouse_id?: string;
  batch_id?: string;
  unit_id?: string;
  created_at?: string;
  categoryType?: CategoryType;
}
