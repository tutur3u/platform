import { Card } from '@tuturuuu/ui/card';
import type { ReactNode } from 'react';

export default function LearnLayout({ children }: { children: ReactNode }) {
  return (
    <div className="container mx-auto p-6">
      <Card className="p-6">{children}</Card>
    </div>
  );
}
