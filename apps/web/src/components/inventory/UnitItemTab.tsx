interface UnitItemTabProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
}

export default function UnitItemTab({
  title,
  description,
  children,
}: UnitItemTabProps) {
  return (
    <>
      <div className="grid">
        <div className="text-2xl font-bold">{title}</div>
        {description && (
          <div className="whitespace-pre-line font-semibold text-zinc-500">
            {description}
          </div>
        )}

        <div className="my-2">{children}</div>
      </div>
    </>
  );
}
