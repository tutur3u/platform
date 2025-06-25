import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer';
import type { CertificateData } from '@tuturuuu/ui/custom/education/certificates/types';
import { BASE_URL } from '@/constants/common';
import { registerRobotoFonts } from '@/lib/font-register-pdf';

registerRobotoFonts();

// Elegant Certificate Styles
const styles = StyleSheet.create({
  // Layout
  page: {
    backgroundColor: '#ffffff',
    padding: '16pt',
  },
  container: {
    backgroundColor: '#fefefe',
    borderWidth: 3,
    borderColor: '#2563eb',
    borderStyle: 'solid',
    padding: '32pt 24pt',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
  },

  // Decorative elements
  topBorder: {
    position: 'absolute',
    top: '12pt',
    left: '12pt',
    right: '12pt',
    height: '2pt',
    backgroundColor: '#dc2626',
  },
  bottomBorder: {
    position: 'absolute',
    bottom: '12pt',
    left: '12pt',
    right: '12pt',
    height: '2pt',
    backgroundColor: '#dc2626',
  },
  leftBorder: {
    position: 'absolute',
    top: '12pt',
    left: '12pt',
    bottom: '12pt',
    width: '2pt',
    backgroundColor: '#dc2626',
  },
  rightBorder: {
    position: 'absolute',
    top: '12pt',
    right: '12pt',
    bottom: '12pt',
    width: '2pt',
    backgroundColor: '#dc2626',
  },

  cornerDecoration: {
    position: 'absolute',
    width: '24pt',
    height: '24pt',
    backgroundColor: '#fbbf24',
  },
  topLeftCorner: {
    top: '6pt',
    left: '6pt',
  },
  topRightCorner: {
    top: '6pt',
    right: '6pt',
  },
  bottomLeftCorner: {
    bottom: '6pt',
    left: '6pt',
  },
  bottomRightCorner: {
    bottom: '6pt',
    right: '6pt',
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

  // Header
  header: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: '24pt',
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#1e40af',
    textAlign: 'center',
    fontFamily: 'Roboto',
    letterSpacing: '1.5pt',
    textTransform: 'uppercase',
  },
  titleUnderline: {
    width: '120pt',
    height: '3pt',
    backgroundColor: '#fbbf24',
    marginTop: '8pt',
  },

  // Body
  body: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '25pt',
    flex: 1,
    justifyContent: 'center',
  },

  certifySection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12pt',
  },
  subtitle: {
    fontSize: 20,
    color: '#374151',
    textAlign: 'center',
    fontFamily: 'Roboto',
    fontWeight: 'light',
  },
  nameContainer: {
    borderBottomWidth: 2,
    borderBottomColor: '#2563eb',
    borderBottomStyle: 'solid',
    paddingBottom: '4pt',
    paddingHorizontal: '16pt',
  },
  name: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
    fontFamily: 'Roboto',
    letterSpacing: '1pt',
  },

  courseSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8pt',
    backgroundColor: '#f8fafc',
    padding: '12pt',
    borderRadius: '8pt',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderStyle: 'solid',
  },
  course: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e40af',
    textAlign: 'center',
    fontFamily: 'Roboto',
  },
  instructorLabel: {
    fontSize: 20,
    color: '#6b7280',
    textAlign: 'center',
    fontFamily: 'Roboto',
    fontWeight: 'light',
  },
  instructor: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#374151',
    textAlign: 'center',
    fontFamily: 'Roboto',
  },

  // Footer
  footer: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: '24pt',
    paddingTop: '12pt',
    borderTop: '1pt solid #d1d5db',
  },
  footerBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6pt',
  },
  footerBlockRight: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6pt',
    alignItems: 'flex-end',
  },
  footerLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontFamily: 'Roboto',
    fontWeight: 'light',
    textTransform: 'uppercase',
    letterSpacing: '0.5pt',
  },
  footerValue: {
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'Roboto',
    color: '#1f2937',
  },

  // Signature line
  signatureLine: {
    width: '120pt',
    height: '1pt',
    backgroundColor: '#9ca3af',
    marginTop: '8pt',
  },
});

// Components
const CertificateHeader = ({ title }: { title: string }) => (
  <View style={styles.header}>
    <Text style={styles.title}>{title}</Text>
    <View style={styles.titleUnderline} />
  </View>
);

const CertificateBody = ({ data }: { data: CertificateData }) => (
  <View style={styles.body}>
    <View style={styles.certifySection}>
      <Text style={styles.subtitle}>{data.certifyText}</Text>
      <View style={styles.nameContainer}>
        <Text style={styles.name}>{data.certData.studentName}</Text>
      </View>
      <Text style={styles.subtitle}>{data.completionText}</Text>
    </View>

    <View style={styles.courseSection}>
      <Text style={styles.course}>{data.certData.courseName}</Text>
      <Text style={styles.instructorLabel}>{data.offeredBy}</Text>
      <Text style={styles.instructor}>{data.certData.courseLecturer}</Text>
    </View>
  </View>
);

const CertificateFooter = ({ data }: { data: CertificateData }) => (
  <View style={styles.footer}>
    <View style={styles.footerBlock}>
      <Text style={styles.footerLabel}>{data.completionDateLabel}</Text>
      <Text style={styles.footerValue}>{data.certData.completionDate}</Text>
      <View style={styles.signatureLine} />
    </View>
    <View style={styles.footerBlockRight}>
      <Text style={styles.footerLabel}>{data.certificateIdLabel}</Text>
      <Text style={styles.footerValue}>{data.certData.certificateId}</Text>
      <View style={styles.signatureLine} />
    </View>
  </View>
);

export const ElegantCertificateDocument: React.FC<{
  data: CertificateData;
}> = ({ data }) => (
  <Document>
    <Page size="A4" orientation="landscape" style={styles.page}>
      <View style={styles.container}>
        {/* Decorative borders */}
        <View style={[styles.cornerDecoration, styles.topLeftCorner]} />
        <View style={[styles.cornerDecoration, styles.topRightCorner]} />
        <View style={[styles.cornerDecoration, styles.bottomLeftCorner]} />
        <View style={[styles.cornerDecoration, styles.bottomRightCorner]} />
        <View style={styles.topBorder} />
        <View style={styles.bottomBorder} />
        <View style={styles.leftBorder} />
        <View style={styles.rightBorder} />

        {/* Watermark */}
        <Image
          src={`${BASE_URL}/media/logos/watermark.png`}
          style={styles.watermark}
        />

        {/* Content */}
        <CertificateHeader title={data.title} />
        <CertificateBody data={data} />
        <CertificateFooter data={data} />
      </View>
    </Page>
  </Document>
);
