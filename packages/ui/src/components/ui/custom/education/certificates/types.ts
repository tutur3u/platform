import type { CertificateTemplate } from '@tuturuuu/types/db';

export type CertificateDetails = {
  courseName: string;
  studentName: string | null;
  courseLecturer: string | null;
  completionDate: string;
  certificateId: string;
  certTemplate: CertificateTemplate;
};

export interface CertificateData {
  certData: CertificateDetails;
  title: string;
  certifyText: string;
  completionText: string;
  offeredBy: string;
  completionDateLabel: string;
  certificateIdLabel: string;
}

export type CertificateProps = {
  certDetails: CertificateDetails;
  wsId: string;
};
