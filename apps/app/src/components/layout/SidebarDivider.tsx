export default function SidebarDivider({
  hidden = false,
  padTop = true,
  padBottom = true,
  padLeft = true,
  padRight = true,
}) {
  return (
    <div
      className={`${hidden || 'bg-zinc-800'} ${padTop ? 'mt-2' : ''} ${
        padBottom ? 'mb-2' : ''
      } ${padLeft ? 'ml-3' : ''} ${padRight ? 'mr-3' : ''} h-[1px]`}
    />
  );
}
