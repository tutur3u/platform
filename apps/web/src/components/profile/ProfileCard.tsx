import React from 'react';

interface ProfileTabProps {
  title: string;
  titleClassname?: string;
  classname?: string;
  children: React.ReactNode;
}

export default function ProfileCard({
  title,
  titleClassname,
  classname,
  children,
}: ProfileTabProps) {
  return (
    <div className={`rounded-lg p-4 text-black ${classname}`}>
      <div className={`text-2xl font-bold ${titleClassname}`}>{title}</div>
      <div>{children}</div>
    </div>
  );
}
