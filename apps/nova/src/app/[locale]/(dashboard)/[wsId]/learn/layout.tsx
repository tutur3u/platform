import { Card } from '@repo/ui/components/ui/card';
import { ReactNode } from 'react';

export default function LearnLayout({ children }: { children: ReactNode }) {
  return (
    <div className="container mx-auto p-6">
      <Card className="p-6">{children}</Card>
    </div>
  );
}