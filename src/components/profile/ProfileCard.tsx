interface ProfileTabProps {
  title: string;
  classname: string;
  children: React.ReactNode;
}

export default function ProfileCard({
  title,
  classname,
  children,
}: ProfileTabProps) {
  return (
    <div className={`${classname} h-fit rounded-lg p-4 text-black`}>
      <div className="text-2xl font-semibold">{title}</div>
      <div>{children}</div>
    </div>
  );
}
