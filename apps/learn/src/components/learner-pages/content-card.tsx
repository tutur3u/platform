import { SurfaceCard } from './shared';

export function ContentCard({
  children,
  icon,
  title,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <SurfaceCard className="p-5">
      <div className="mb-4 flex items-center gap-2 font-bold text-sm">
        <span className="text-muted-foreground">{icon}</span>
        <span>{title}</span>
      </div>
      <div>{children}</div>
    </SurfaceCard>
  );
}
