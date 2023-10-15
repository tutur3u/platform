import { generateUUID } from '@/utils/uuid-helper';

export type MigrationModule =
  | 'users'
  | 'user-linked-coupons'
  | 'roles'
  | 'classes'
  | 'class-members'
  | 'class-score-groups'
  | 'class-score-names'
  | 'class-scores'
  | 'class-user-feedbacks'
  | 'class-user-attendances'
  | 'class-lessons'
  | 'class-linked-packages'
  | 'packages'
  | 'package-categories'
  | 'package-units'
  | 'package-prices'
  | 'payment-methods'
  | 'warehouses'
  | 'transactions'
  | 'coupons'
  | 'bills'
  | 'bill-packages'
  | 'bill-coupons';

export interface ModulePackage {
  name: string;
  module: MigrationModule;
  externalAlias?: string;
  externalPath: string;
  internalAlias?: string;
  internalPath?: string;
  mapping?: (data: any[]) => any[];
  disabled?: boolean;
}

export const modules: ModulePackage[] = [
  {
    name: 'Virtual Users',
    module: 'users',
    externalAlias: 'users',
    externalPath: '/dashboard/data/users',
    internalPath: '/api/workspaces/[wsId]/users/migrate',
    mapping: (items) =>
      items.map((i) => ({
        id: i?.id,
        email: i?.email,
        full_name: i?.display_name,
        display_name: i?.nickname,
        phone: i?.phone_number,
        avatar_url: i?.avatar_url,
        gender: i?.gender,
        birthday: i?.birthday,
        created_at: i?.created_at,
        note: `${i?.nickname ? `Nickname: ${i.nickname}\n` : ''}${
          i?.relationship ? `Relationship: ${i.relationship}\n` : ''
        }${i?.notes ? `Notes: ${i.notes}\n` : ''}`,
      })),
  },
  {
    name: 'User Groups',
    module: 'roles',
    externalAlias: 'roles',
    externalPath: '/dashboard/data/users/roles',
    internalAlias: 'groups',
    internalPath: '/api/workspaces/[wsId]/users/groups/migrate',
    mapping: (items) =>
      items.map((i) => ({
        id: i?.id,
        name: i?.name,
        created_at: i?.created_at,
      })),
  },
  {
    name: 'User Group Members',
    module: 'class-members',
    externalAlias: 'members',
    externalPath: '/migrate/members',
    internalPath: '/api/workspaces/[wsId]/users/groups/members/migrate',
    mapping: (items) =>
      items.map((i) => ({
        user_id: i?.user_id,
        group_id: i?.class_id,
        created_at: i?.created_at,
      })),
  },
  {
    name: 'User Indicators',
    module: 'class-score-names',
    externalAlias: 'names',
    externalPath: '/dashboard/data/classes/score-names',
    internalAlias: 'indicators',
    internalPath: '/api/workspaces/[wsId]/users/indicators/migrate',
    mapping: (items) =>
      items.map((i) => ({
        id: i?.id,
        name: i?.name,
        created_at: i?.created_at,
      })),
  },
  {
    name: 'User Group Indicators',
    module: 'class-score-groups',
    externalAlias: 'names',
    externalPath: '/dashboard/data/classes/score-names',
    internalAlias: 'indicators',
    internalPath: '/api/workspaces/[wsId]/users/groups/indicators/migrate',
    mapping: (items) =>
      items.map((i) => ({
        id: i?.id,
        indicator_id: i?.id,
        group_id: i?.class_id,
        created_at: i?.created_at,
      })),
  },
  {
    name: 'User Feedbacks',
    module: 'class-user-feedbacks',
    externalAlias: 'feedbacks',
    externalPath: '/dashboard/data/classes/feedbacks',
    internalPath: '/api/workspaces/[wsId]/users/feedbacks/migrate',
    mapping: (items) =>
      items.map((i) => ({
        id: i?.id,
        user_id: i?.user_id,
        group_id: i?.class_id,
        content: i?.content,
        require_attention: i?.performance === 'NEED_HELP',
        // creator_id: i?.creator_id,
        created_at: i?.created_at,
      })),
  },
  {
    name: 'User Group Attendances',
    module: 'class-user-attendances',
    externalAlias: 'attendance',
    externalPath: '/dashboard/data/classes/attendance',
    internalPath: '/api/workspaces/[wsId]/users/groups/attendance/migrate',
    mapping: (items) =>
      items.map((i) => ({
        group_id: i?.class_id,
        user_id: i?.user_id,
        date: i?.date,
        status: i?.status,
        notes: i?.notes || '',
        created_at: i?.created_at,
      })),
  },
  {
    name: 'User Group Posts',
    module: 'class-lessons',
    externalAlias: 'lessons',
    externalPath: '/dashboard/data/classes/lessons',
    internalAlias: 'posts',
    internalPath: '/api/workspaces/[wsId]/users/groups/posts/migrate',
    mapping: (items) =>
      items.map((i) => ({
        id: i?.id,
        group_id: i?.class_id,
        title: i?.title || '',
        content: i?.content || '',
        notes: i?.notes || '',
        created_at: i?.created_at,
      })),
  },
  {
    name: 'Warehouses',
    module: 'warehouses',
    externalAlias: 'warehouses',
    externalPath: '/dashboard/data/packages/warehouses',
    internalPath: '/api/workspaces/[wsId]/warehouses/migrate',
    mapping: (items) =>
      items.map((i) => ({
        id: i?.id,
        name: i?.name,
      })),
  },
  {
    name: 'Product Categories',
    module: 'package-categories',
    externalAlias: 'categories',
    externalPath: '/dashboard/data/packages/categories',
    internalPath: '/api/workspaces/[wsId]/products/categories/migrate',
    mapping: (items) =>
      items.map((i) => ({
        id: i?.id,
        name: i?.name,
      })),
  },
  {
    name: 'Product Units',
    module: 'package-units',
    externalAlias: 'units',
    externalPath: '/dashboard/data/packages/units',
    internalAlias: 'units',
    internalPath: '/api/workspaces/[wsId]/products/units/migrate',
    mapping: (items) =>
      items.map((i) => ({
        id: i?.id,
        name: i?.name,
      })),
  },
  {
    name: 'Products',
    module: 'packages',
    externalAlias: 'packages',
    externalPath: '/dashboard/data/packages',
    internalAlias: 'products',
    internalPath: '/api/workspaces/[wsId]/products/migrate',
    mapping: (items) =>
      items.map((i) => ({
        id: i?.id,
        name: i?.name,
        description: i?.content,
        category_id:
          i?.type === 'COURSE'
            ? 'b58cdb48-67fb-49ef-86c6-1ba84c4728d6'
            : i?.type === 'LESSON'
            ? '6a5b39e6-c3ac-4f21-ac44-faaacf02bbde'
            : i?.type === 'ACCESSORY'
            ? '4b1733db-38b7-4603-bf66-6f4e6b582b5b'
            : i?.type === 'BOOK'
            ? '3cb87605-c01a-441e-a98a-9324cf48657a'
            : i?.type === 'EVENT'
            ? '9bc7ee58-537a-4ff4-9a8f-ee10a875568c'
            : undefined,
        manufacturer: i?.manufacturer,
        created_at: i?.created_at,
      })),
  },
  {
    name: 'Product Prices',
    module: 'package-prices',
    externalAlias: 'packages',
    externalPath: '/dashboard/data/packages',
    internalAlias: 'products',
    internalPath: '/api/workspaces/[wsId]/products/prices/migrate',
    mapping: (items) =>
      items.map((i) => ({
        id: i?.id,
        product_id: i?.id,
        unit_id: 'dbd4d6a0-6c59-4383-8512-8e649413f4ff',
        warehouse_id: '9ed8a0ed-a192-456d-9382-88258300fb27',
        amount: i?.stock,
        price: i?.price,
        created_at: i?.created_at,
      })),
  },
  {
    name: 'User Group Linked Products',
    module: 'class-linked-packages',
    externalAlias: 'packages',
    externalPath: '/dashboard/data/classes/packages',
    internalAlias: 'products',
    internalPath: '/api/workspaces/[wsId]/users/groups/products/migrate',
    mapping: (items) =>
      items.map((i) => ({
        id: i?.package_id + i?.class_id,
        group_id: i?.class_id,
        product_id: i?.package_id,
        unit_id: 'dbd4d6a0-6c59-4383-8512-8e649413f4ff',
        created_at: i?.created_at,
      })),
  },
  {
    name: 'Wallets',
    module: 'payment-methods',
    externalAlias: 'methods',
    externalPath: '/dashboard/data/payment-methods',
    internalAlias: 'wallets',
    internalPath: '/api/workspaces/[wsId]/wallets/migrate',
    mapping: (items) =>
      items.map((i) => ({
        id: i?.id,
        name: i?.name,
      })),
  },
  {
    name: 'Wallet transactions',
    module: 'transactions',
    externalAlias: 'bills',
    externalPath: '/dashboard/data/bills',
    internalAlias: 'transactions',
    internalPath: '/api/workspaces/[wsId]/wallets/transactions/migrate',
    mapping: (items) =>
      items.map((i) => {
        const walletId =
          i?.method === 'CASH'
            ? '354f92e4-8e7c-404a-b461-cfe6a8b67ba8'
            : i?.method === 'BANKING'
            ? '8ca90c9e-de28-4284-b388-294b704d78bc'
            : '';

        // There is a "valid_until" field on item, which is type of date
        // convert it to timestamptz (+7) and use it as "taken_at" field
        const takenAt = i?.valid_until ? new Date(i?.valid_until) : null;

        return {
          id: generateUUID(i?.id, walletId),
          wallet_id: walletId,
          amount: i?.total + i?.price_diff,
          description: i?.content,
          // TODO: add new field to take product categories and use it here
          // think of some mechanism to pick the most suitable category from invoice_products
          // category_id: i?.category_id,
          taken_at: takenAt ? takenAt.toISOString() : i?.created_at,
          created_at: i?.created_at,
          _id: i?.id,
        };
      }),
  },
  {
    name: 'Invoices',
    module: 'bills',
    externalAlias: 'bills',
    externalPath: '/dashboard/data/bills',
    internalAlias: 'invoices',
    internalPath: '/api/workspaces/[wsId]/invoices/migrate',
    mapping: (items) =>
      items.map((i) => {
        const walletId =
          i?.method === 'CASH'
            ? '354f92e4-8e7c-404a-b461-cfe6a8b67ba8'
            : i?.method === 'BANKING'
            ? '8ca90c9e-de28-4284-b388-294b704d78bc'
            : '';

        return {
          id: i?.id,
          transaction_id: generateUUID(i?.id, walletId),
          price: i?.total,
          total_diff: i?.price_diff,
          notice: i?.content,
          note: i?.note,
          customer_id: i?.customer_id,
          completed_at: i?.created_at,
          created_at: i?.created_at,
        };
      }),
  },
  {
    name: 'Invoice Products',
    module: 'bill-packages',
    externalAlias: 'packages',
    externalPath: '/dashboard/data/bills/packages',
    internalAlias: 'products',
    internalPath: '/api/workspaces/[wsId]/invoices/products/migrate',
    mapping: (items) =>
      items.map((i) => ({
        _id: i?.id,
        invoice_id: i?.bill_id,
        product_id: i?.pkg_id,
        product_name: i?.name,
        product_unit: 'Cái',
        unit_id: 'dbd4d6a0-6c59-4383-8512-8e649413f4ff',
        warehouse_id: '9ed8a0ed-a192-456d-9382-88258300fb27',
        amount: i?.amount,
        price: i?.price,
        created_at: i?.created_at,
      })),
  },
  {
    name: 'Promotions',
    module: 'coupons',
    externalAlias: 'coupons',
    externalPath: '/dashboard/data/coupons',
    internalAlias: 'promotions',
    internalPath: '/api/workspaces/[wsId]/promotions/migrate',
    mapping: (items) =>
      items.map((i) => ({
        id: i?.id,
        name: i?.name,
        description: i?.content,
        code: i?.code,
        value: i?.value,
        use_ratio: i?.use_ratio,
        created_at: i?.created_at,
      })),
  },
  {
    name: 'Virtual Users Linked Promotions',
    module: 'user-linked-coupons',
    externalAlias: 'coupons',
    externalPath: '/dashboard/data/users/coupons',
    internalAlias: 'promotions',
    internalPath: '/api/workspaces/[wsId]/users/promotions/migrate',
    mapping: (items) =>
      items.map((i) => ({
        user_id: i?.user_id,
        promo_id: i?.coupon_id,
        created_at: i?.created_at,
      })),
  },
  {
    name: 'Invoice Promotions',
    module: 'bill-coupons',
    externalAlias: 'coupons',
    externalPath: '/dashboard/data/bills/coupons',
    internalAlias: 'promotions',
    internalPath: '/api/workspaces/[wsId]/invoices/promotions/migrate',
    mapping: (items) =>
      items.map((i) => ({
        _id: i?.id,
        invoice_id: i?.bill_id,
        promo_id: i?.coupon_id,
        code: i?.code,
        name: i?.name,
        value: i?.value,
        use_ratio: i?.ratio,
        created_at: i?.created_at,
      })),
  },
];
