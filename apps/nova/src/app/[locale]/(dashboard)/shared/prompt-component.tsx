import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';

export interface PromptComponentProps {
  className?: string;
  children?: React.ReactNode;
}

export default function PromptComponent({
  className,
  children,
}: PromptComponentProps) {
  return (
    <Card
      className={`bg-foreground/10 text-foreground flex h-full flex-col overflow-y-auto ${className}`}
    >
      <CardHeader>
        <CardTitle className="text-xl">Prompt Engineering Challenge</CardTitle>
      </CardHeader>
      <CardContent className="flex-1">{children}</CardContent>
    </Card>
  );
}
