import { NavTabs } from '../../types/Tab';

export const wsUserDetailsTabs: NavTabs = {
  namespace: 'ws-user-details-tabs',
  tabs: [
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
  ],
};
