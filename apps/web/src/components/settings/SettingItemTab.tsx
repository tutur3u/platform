interface SettingItemTabProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

export default function SettingItemTab({
  title,
  description,
  children,
}: SettingItemTabProps) {
  return (
    <>
      <div className="grid">
        <div className="font-bold">{title}</div>
        {description && (
          <div className="text-muted-foreground whitespace-pre-line text-sm font-semibold">
            {description}
          </div>
        )}

        <div className="my-2">{children}</div>
      </div>
    </>
  );
}
