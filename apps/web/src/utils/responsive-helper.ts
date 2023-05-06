import { SidebarState } from '../hooks/useAppearance';

interface CloseSidebarOnMobileProps {
  window: Window | undefined;
  setSidebar: (state: SidebarState) => void;
  disableAutoClose?: boolean;
}

export const closeSidebarOnMobile = ({
  window,
  setSidebar,
  disableAutoClose = false,
}: CloseSidebarOnMobileProps) => {
  if (disableAutoClose || !window) return;
  if (window.innerWidth <= 768) setSidebar('closed');
};
