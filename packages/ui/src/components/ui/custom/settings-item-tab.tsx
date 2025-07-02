interface SettingItemTabProps {
  title: React.ReactNode;
  description?: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}

export function SettingItemTab({
  title,
  description,
  children,
  icon,
}: SettingItemTabProps) {
  return (
    <>
      <div className="grid">
        <div className="flex items-center gap-2 font-bold">
          {icon && <div className="text-dynamic-blue">{icon}</div>}
          {title}
        </div>
        {description && (
          <div className="whitespace-pre-line font-semibold text-muted-foreground text-sm">
            {description}
          </div>
        )}

        <div className="my-2">{children}</div>
      </div>
    </>
  );
}
