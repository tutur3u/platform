import { CertificateProps } from '@/app/[locale]/(dashboard)/[wsId]/certificate/[certID]/page';
import { DEV_MODE } from '@/constants/common';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { NextRequest } from 'next/server';
import { renderToStream} from '@react-pdf/renderer';
import { Document, Page, View, Text, StyleSheet, Image } from '@react-pdf/renderer';

export interface CertificateData {
  certData: CertificateProps['certDetails'];
  title: string;
  certify_text: string;
  completion_text: string;
  offered_by: string;
  completion_date: string;
  certificate_id: string;
}

type format = 'pdf' | 'png';

const URL = DEV_MODE ? 'http://localhost:7806' : 'https://upskii.com';

// Create styles
const styles = StyleSheet.create({
  page: {
    backgroundColor: '#f8fafc',
    padding: '16pt',
  },
  container: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderWidth: 1,
    padding: '48pt',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: '36pt',
  },
  watermark: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    opacity: 0.12,
    zIndex: 0,
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12pt',
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
  },
  separator: {
    height: 1,
    backgroundColor: '#0a0a0a',
    width: '100%',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '25pt',
  },
  subtitle: {
    fontSize: 20,
    color: '#000000',
    textAlign: 'center',
  },
  name: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
  },
  course: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
  },
  instructor: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
  },
  footer: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: '32pt',
  },
  footerBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4pt',
  },
  footerBlockRight: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4pt',
    alignItems: 'flex-end',
  },
  footerLabel: {
    fontSize: 14,
    color: '#4b5563',
  },
  footerLabelRight: {
    fontSize: 14,
    color: '#4b5563',
  },
  footerValue: {
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'Courier',
  },
});

export const CertificateDocument: React.FC<{ data: CertificateData }> = ({ data }) => (
  <Document>
    <Page size="A4" orientation="landscape" style={styles.page}>
      <View style={styles.container}>
        <Image src={`${URL}/media/logos/watermark.png`} style={styles.watermark} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{data.title}</Text>
          <View style={styles.separator} />
        </View>

        {/* Certificate Body */}
        <View style={styles.body}>
          <Text style={styles.subtitle}>{data.certify_text}</Text>
          <Text style={styles.name}>{data.certData.studentName}</Text>
          <Text style={styles.subtitle}>{data.completion_text}</Text>
          <Text style={styles.course}>{data.certData.courseName}</Text>
          <Text style={styles.subtitle}>{data.offered_by}</Text>
          <Text style={styles.instructor}>{data.certData.courseLecturer}</Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerBlock}>
            <Text style={styles.footerLabel}>Completion Date:</Text>
            <Text style={styles.footerValue}>{data.certData.completionDate}</Text>
          </View>
          <View style={styles.footerBlockRight}>
            <Text style={styles.footerLabelRight}>Certificate ID:</Text>
            <Text style={styles.footerValue}>{data.certData.certificateId}</Text>
          </View>
        </View>
      </View>
    </Page>
  </Document>
);

export const getCertificateData = async (certID: string) => {
  const response = await fetch(`${URL}/api/v1/certificates/${certID}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch certificate data');
  }

  const userDetails = await getCurrentUser();
  const certDetails = await response.json();

  if (userDetails) {
    certDetails.studentName = userDetails.display_name;
  }

  return certDetails;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ certId: string }> }
) {
  try {
    const {
      title,
      certifyText,
      completionText,
      offeredBy,
      completionDateLabel,
      certificateIdLabel,
    } = await req.json();
    const { certId } = await params;

    const format = req.nextUrl.searchParams.get('format') as format;

    if (format !== 'pdf' && format !== 'png') {
      return new Response('Invalid format', { status: 400 });
    }

    if (!certId) {
      return new Response('Certificate ID is required', { status: 400 });
    }

    const certData = await getCertificateData(certId);

    const data: CertificateData = {
      certData,
      title,
      certify_text: certifyText,
      completion_text: completionText,
      offered_by: offeredBy,
      completion_date: completionDateLabel,
      certificate_id: certificateIdLabel,
    };

    const stream = await renderToStream(<CertificateDocument data={data} />);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${certId}.pdf"`,
      },
    });
  } catch (error) {
    console.error('PDF generation failed:', error);
    return new Response('Error generating PDF', { status: 500 });
  }
} 