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
      <div className="flex flex-col gap-1">
        <div className="text-2xl font-bold">{title}</div>
        {description && (
          <div className="whitespace-pre-line font-semibold text-zinc-500">
            {description}
          </div>
        )}
        {children}
      </div>
    </>
  );
}
