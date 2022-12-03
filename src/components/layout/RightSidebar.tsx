import { SidebarProps } from '../../types/SidebarProps';

function RightSidebar({ className }: SidebarProps) {
  const amount = 10;
  return amount > 0 ? (
    <div
      className={`${className} group fixed top-0 right-0 z-20 hidden h-full flex-col items-center justify-center border-l border-zinc-800/80 bg-zinc-900 backdrop-blur-lg md:block`}
    ></div>
  ) : null;
}

export default RightSidebar;
