export type Tab = {
  name: string;
  href: string;
};

export const workspaceTabs: Tab[] = [
  {
    name: 'Home',
    href: '/[wsId]',
  },
  {
    name: 'Teams',
    href: '/[wsId]/teams',
  },
  {
    name: 'Members',
    href: '/[wsId]/members',
  },
  {
    name: 'Settings',
    href: '/[wsId]/settings',
  },
];

export const workspaceUsersTabs: Tab[] = [
  {
    name: 'Overview',
    href: '/[wsId]/users',
  },
  {
    name: 'List',
    href: '/[wsId]/users/list',
  },
  {
    name: 'Roles',
    href: '/[wsId]/users/roles',
  },
];

export const teamTabs: Tab[] = [
  {
    name: 'Overview',
    href: '/[wsId]/teams/[teamId]',
  },
  {
    name: 'Members',
    href: '/[wsId]/teams/[teamId]/members',
  },
  {
    name: 'Settings',
    href: '/[wsId]/teams/[teamId]/settings',
  },
];

export const healthcareTabs: Tab[] = [
  {
    name: 'Overview',
    href: '/[wsId]/healthcare',
  },
  {
    name: 'Đơn thuốc',
    href: '/[wsId]/healthcare/prescriptions',
  },
  {
    name: 'Kiểm tra sức khoẻ',
    href: '/[wsId]/healthcare/checkups',
  },
  {
    name: 'Chẩn đoán',
    href: '/[wsId]/healthcare/diagnoses',
  },
  {
    name: 'Chỉ số',
    href: '/[wsId]/healthcare/vitals',
  },
  {
    name: 'Nhóm chỉ số',
    href: '/[wsId]/healthcare/vital-groups',
  },
];

export const inventoryTabs: Tab[] = [
  {
    name: 'Overview',
    href: '/[wsId]/inventory',
  },
  {
    name: 'Sản phẩm',
    href: '/[wsId]/inventory/products',
  },
  {
    name: 'Danh mục sản phẩm',
    href: '/[wsId]/inventory/categories',
  },
  {
    name: 'Lô hàng',
    href: '/[wsId]/inventory/batches',
  },
  {
    name: 'Kho chứa',
    href: '/[wsId]/inventory/warehouses',
  },
  {
    name: 'Đơn vị tính',
    href: '/[wsId]/inventory/units',
  },
  {
    name: 'Nhà cung cấp',
    href: '/[wsId]/inventory/suppliers',
  },
  // {
  //   name: 'Mã giảm giá',
  //   href: '/[wsId]/inventory/promotions',
  // },
];

export const financeTabs: Tab[] = [
  {
    name: 'Overview',
    href: '/[wsId]/finance',
  },
  {
    name: 'Nguồn tiền',
    href: '/[wsId]/finance/wallets',
  },
  {
    name: 'Giao dịch',
    href: '/[wsId]/finance/transactions',
  },
  {
    name: 'Danh mục giao dịch',
    href: '/[wsId]/finance/categories',
  },
];

export const productDetailsTabs: Tab[] = [
  {
    name: 'Thông tin',
    href: '/[wsId]/inventory/products/[productId]',
  },
  {
    name: 'Nguồn gốc',
    href: '/[wsId]/inventory/products/[productId]/origin',
  },
];

export const wsUserDetailsTabs: Tab[] = [
  {
    name: 'Thông tin',
    href: '/[wsId]/users/[userId]',
  },
  {
    name: 'Chỉ số',
    href: '/[wsId]/users/[userId]/vitals',
  },
  {
    name: 'Đơn thuốc',
    href: '/[wsId]/users/[userId]/prescriptions',
  },
  {
    name: 'Kiểm tra sức khoẻ',
    href: '/[wsId]/users/[userId]/checkups',
  },
];
