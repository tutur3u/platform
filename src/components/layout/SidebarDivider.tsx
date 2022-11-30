export default function SidebarDivider({ hidden = false }) {
  return <div className={`mx-3 my-2 h-[1px] ${hidden || 'bg-zinc-800'}`} />;
}
