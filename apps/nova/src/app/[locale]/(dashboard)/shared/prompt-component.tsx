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
      className={`h-full w-full overflow-hidden bg-foreground/10 text-foreground ${className}`}
    >
      <CardHeader>
        <CardTitle className="text-xl">Prompt Engineering Challenge</CardTitle>
      </CardHeader>
      <CardContent className="h-full">{children}</CardContent>
    </Card>
  );
}
