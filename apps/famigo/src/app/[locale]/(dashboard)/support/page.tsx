import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { MessageCircle } from '@tuturuuu/ui/icons';

export default async function SupportPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <MessageCircle className="h-6 w-6" />
        <h1 className="text-2xl font-bold">My Inquiries</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>My Support Inquiries</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-12 text-center text-muted-foreground">
            <MessageCircle className="mx-auto mb-4 h-12 w-12 opacity-50" />
            <p>No inquiries yet</p>
            <p className="mt-2 text-sm">Create an inquiry to get started</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
