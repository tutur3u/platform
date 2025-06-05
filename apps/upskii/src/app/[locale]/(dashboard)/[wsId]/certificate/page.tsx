import { getAllCertificatesForUser } from '@/lib/certificate-helper';
import { createClient } from '@tuturuuu/supabase/next/server';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Award, Calendar, Download, Eye } from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import moment from 'moment';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function CertificatesPage({ params }: Props) {
  const { wsId } = await params;
  const t = await getTranslations('certificates');
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    redirect('/');
  }

  try {
    const certificates = await getAllCertificatesForUser(user.id, wsId);

    return (
      <>
        <FeatureSummary
          pluralTitle={t('page_title')}
          description={
            t('page_description')
          }
        />
        <Separator className="my-4" />

        {certificates.length === 0 ? (
          <div className="flex h-64 items-center justify-center">
            <div className="text-center">
              <Award className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                {t('empty_state_title')}
              </h3>
              <p className="text-muted-foreground mb-4">
                {t('empty_state_description')}
              </p>
              <Button asChild>
                <Link href={`/${wsId}/courses`}>
                  {t('browse_courses')}
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {certificates.map((certificate) => (
              <Card
                key={certificate.id}
                className="group transition-all hover:shadow-md hover:border-primary/20"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="line-clamp-2 text-base">
                        {certificate.courseName}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {certificate.workspaceName}
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      <Award className="mr-1 h-3 w-3" />
                      Certified
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>
                      Completed {moment(certificate.completionDate).format('MMM D, YYYY')}
                    </span>
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground font-mono">
                    {t('certificate_id')}: {certificate.id}
                  </div>
                </CardContent>

                <CardFooter className="pt-3 gap-2">
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="flex-1"
                  >
                    <Link href={`/${wsId}/certificate/${certificate.id}`}>
                      <Eye className="mr-1 h-3 w-3" />
                      View
                    </Link>
                  </Button>
                  <Button
                    asChild
                    size="sm"
                    className="flex-1"
                  >
                    <Link href={`/${wsId}/certificate/${certificate.id}`}>
                      <Download className="mr-1 h-3 w-3" />
                      Download
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </>
    );
  } catch (error) {
    console.error('Error fetching certificates:', error);
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">
            {t('error')}
          </h3>
          <p className="text-muted-foreground">
            {t('error_description')}
          </p>
        </div>
      </div>
    );
  }
}