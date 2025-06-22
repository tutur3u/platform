import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Users } from '@tuturuuu/ui/icons';

export default async function AdminSupportPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Users className="h-6 w-6" />
        <h1 className="text-2xl font-bold">All Inquiries</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Support Inquiries</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-12 text-center text-muted-foreground">
            <Users className="mx-auto mb-4 h-12 w-12 opacity-50" />
            <p>No inquiries yet</p>
            <p className="mt-2 text-sm">Inquiries will appear here</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
