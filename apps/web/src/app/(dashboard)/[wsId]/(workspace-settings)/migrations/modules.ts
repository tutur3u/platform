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
  },
  {
    name: 'User Group Attendances',
    module: 'class-user-attendances',
    externalAlias: 'attendance',
    externalPath: '/dashboard/data/classes/attendance',
  },
  {
    name: 'User Group Content',
    module: 'class-lessons',
    externalAlias: 'lessons',
    externalPath: '/dashboard/data/classes/lessons',
  },
  {
    name: 'User Group Linked Products',
    module: 'class-linked-packages',
    externalAlias: 'packages',
    externalPath: '/dashboard/data/classes/packages',
  },
  {
    name: 'Products',
    module: 'packages',
    externalAlias: 'packages',
    externalPath: '/dashboard/data/packages',
  },
  {
    name: 'Product Categories',
    module: 'package-categories',
    externalAlias: 'categories',
    externalPath: '/dashboard/data/packages/categories',
  },
  {
    name: 'Wallets',
    module: 'payment-methods',
    externalAlias: 'methods',
    externalPath: '/dashboard/data/payment-methods',
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
  },
  {
    name: 'Virtual Users Linked Promotions',
    module: 'user-linked-coupons',
    externalAlias: 'coupons',
    externalPath: '/dashboard/data/users/coupons',
  },
  {
    name: 'Invoice Promotions',
    module: 'bill-coupons',
    externalAlias: 'coupons',
    externalPath: '/dashboard/data/bills/coupons',
  },
];
