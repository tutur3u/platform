import { recommendedTools, tools } from './tools';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@repo/ui/components/ui/card';
import Link from 'next/link';

export default async function MagicToolsPage({
  params,
}: {
  params: Promise<{
    locale: string;
  }>;
}) {
  const { locale } = await params;

  if (locale === 'vi')
    return (
      <div className="flex h-screen w-full items-center justify-center text-center text-2xl font-bold">
        Bạn cần đổi ngôn ngữ sang tiếng Anh để xem trang này.
      </div>
    );

  return (
    <div className="grid gap-8">
      <section>
        <h2 className="from-dynamic-light-purple to-dynamic-light-red mb-4 bg-gradient-to-br bg-clip-text py-1 text-xl font-bold text-transparent lg:text-3xl">
          Recommended For You
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {recommendedTools.map((tool) => (
            <Link href={`/tools/${tool.id}`} key={tool.name} className="h-full">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>{tool.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p>{tool.description}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="from-dynamic-light-purple to-dynamic-light-red mb-4 bg-gradient-to-br bg-clip-text py-1 text-xl font-bold text-transparent lg:text-3xl">
          All Tools
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {tools.map((tool) => (
            <Link href={`/tools/${tool.id}`} key={tool.name} className="h-full">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>{tool.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p>{tool.description}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
