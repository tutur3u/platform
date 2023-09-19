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
  | 'payment-methods'
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
        name: i?.display_name,
        phone: i?.phone_number,
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
    name: 'Products',
    module: 'packages',
    externalAlias: 'packages',
    externalPath: '/dashboard/data/packages',
    // internalAlias: 'products',
    // internalPath: '/api/workspaces/[wsId]/products/migrate',
    // mapping: (items) =>
    //   items.map((i) => ({
    //     id: i?.id,
    //     name: i?.name,
    // }))
  },
  {
    name: 'User Group Linked Products',
    module: 'class-linked-packages',
    externalAlias: 'packages',
    externalPath: '/dashboard/data/classes/packages',
    // internalAlias: 'products',
    // internalPath: '/api/workspaces/[wsId]/users/groups/products/migrate',
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
  },
  {
    name: 'Invoice Products',
    module: 'bill-packages',
    externalAlias: 'packages',
    externalPath: '/dashboard/data/bills/packages',
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
  },
];
