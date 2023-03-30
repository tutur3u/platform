export type Tab = {
  name: string;
  href: string;
};

export const workspaceTabs: Tab[] = [
  {
    name: 'Overview',
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

export const miscTabs: Tab[] = [
  {
    name: 'Overview',
    href: '/[wsId]/misc',
  },
  {
    name: 'Bệnh nhân',
    href: '/[wsId]/misc/patients',
  },
  {
    name: 'Đơn thuốc',
    href: '/[wsId]/misc/prescriptions',
  },
  {
    name: 'Kiểm tra sức khoẻ',
    href: '/[wsId]/misc/checkups',
  },
  {
    name: 'Chẩn đoán',
    href: '/[wsId]/misc/diagnoses',
  },
  {
    name: 'Chỉ số',
    href: '/[wsId]/misc/vitals',
  },
  {
    name: 'Nhóm chỉ số',
    href: '/[wsId]/misc/vital-groups',
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

export const patientDetailsTabs: Tab[] = [
  {
    name: 'Thông tin',
    href: '/[wsId]/misc/patients/[patientId]',
  },
  {
    name: 'Chỉ số',
    href: '/[wsId]/misc/patients/[patientId]/vitals',
  },
  {
    name: 'Khám bệnh',
    href: '/[wsId]/misc/patients/[patientId]/examinations',
  },
  {
    name: 'Xét nghiệm',
    href: '/[wsId]/misc/patients/[patientId]/tests',
  },
  {
    name: 'Siêu âm',
    href: '/[wsId]/misc/patients/[patientId]/ultrasounds',
  },
];
