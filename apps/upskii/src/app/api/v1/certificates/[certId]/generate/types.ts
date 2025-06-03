import { CertificateProps } from '@/app/[locale]/(dashboard)/[wsId]/certificate/[certificateId]/page';

export interface CertificateData {
  certData: CertificateProps['certDetails'];
  title: string;
  certify_text: string;
  completion_text: string;
  offered_by: string;
  completion_date: string;
  certificate_id: string;
}
