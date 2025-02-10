import { createClient } from '@tutur3u/supabase/next/server';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tutur3u/ui/components/ui/card';
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
    crawlerId: string;
  }>;
}

export default async function DatasetDetailsPage({ params }: Props) {
  const { crawlerId } = await params;

  const supabase = await createClient();
  const { data } = await supabase
    .from('workspace_crawlers')
    .select('*')
    .eq('id', crawlerId)
    .single();

  if (!data) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{data.url}</h1>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>HTML Elements</CardTitle>
          <CardDescription>
            {data.html_ids?.length || 0} elements configured
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
