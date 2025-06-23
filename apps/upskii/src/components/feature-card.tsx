'use client';

import type { LucideIcon } from 'lucide-react';

interface FeatureCardProps {
  icon: LucideIcon;
  name: string;
}

export function FeatureCard({ icon: Icon, name }: FeatureCardProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border p-4 transition-all hover:shadow-md">
      <Icon className="h-8 w-8 text-dynamic-blue" />
      <span className="font-semibold">{name}</span>
    </div>
  );
}
