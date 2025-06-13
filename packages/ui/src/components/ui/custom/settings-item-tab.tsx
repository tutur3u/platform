interface SettingItemTabProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function SettingItemTab({
  title,
  description,
  children,
}: SettingItemTabProps) {
  return (
    <>
      <div className="grid">
        <div className="font-bold">{title}</div>
        {description && (
          <div className="text-sm font-semibold whitespace-pre-line text-muted-foreground">
            {description}
          </div>
        )}

        <div className="my-2">{children}</div>
      </div>
    </>
  );
}
