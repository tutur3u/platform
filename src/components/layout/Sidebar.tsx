interface SidebarProps {
  className?: string;
}

export default function Sidebar({ className }: SidebarProps) {
  return (
    <div
      className={`${className} z-10 bg-zinc-800 w-[15rem] h-full fixed flex flex-col justify-center items-center top-0 left-[4.5rem]`}
    >
      <div className="h-[95%] w-full flex flex-col justify-between items-center"></div>
    </div>
  );
}
