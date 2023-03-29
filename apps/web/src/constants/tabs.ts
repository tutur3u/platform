export type Tab = {
  name: string;
  href: string;
};

export const workspaceTabs: Tab[] = [
  {
    name: 'Tổng quan',
    href: '/[wsId]/overview',
  },
  {
    name: 'Dự án',
    href: '/[wsId]/projects',
  },
  {
    name: 'Thành viên',
    href: '/[wsId]/members',
  },
  {
    name: 'Cài đặt',
    href: '/[wsId]/settings',
  },
];

export const projectTabs: Tab[] = [
  {
    name: 'Tổng quan',
    href: '/[wsId]/projects/[projectId]',
  },
  {
    name: 'Thành viên',
    href: '/[wsId]/projects/[projectId]/members',
  },
  {
    name: 'Cài đặt',
    href: '/[wsId]/projects/[projectId]/settings',
  },
];

export const miscTabs: Tab[] = [
  {
    name: 'Tổng quan',
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
    name: 'Tổng quan',
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
    name: 'Tổng quan',
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
