import { CertificateProps } from '@/app/[locale]/(dashboard)/[wsId]/certificate/[certificateId]/page';

export interface CertificateData {
  certData: CertificateProps['certDetails'];
  title: string;
  certifyText: string;
  completionText: string;
  offeredBy: string;
  completionDateLabel: string;
  certificateIdLabel: string;
}
