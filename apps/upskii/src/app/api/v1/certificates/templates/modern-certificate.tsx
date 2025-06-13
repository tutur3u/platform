import { BASE_URL } from '@/constants/common';
import { registerRobotoFonts } from '@/lib/font-register-pdf';
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer';
import type { CertificateData } from '@tuturuuu/ui/custom/education/certificates/types';
import type React from 'react';

registerRobotoFonts();

// Modern Certificate Styles
const styles = StyleSheet.create({
  // Layout
  page: {
    backgroundColor: '#0f172a',
    padding: '8pt', // Reduced from 12pt
  },
  container: {
    backgroundColor: '#ffffff',
    padding: '20pt', // Reduced from 30pt
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
    overflow: 'hidden',
    gap: '16pt', // Reduced from 24pt
  },

  // Header section with gradient-like effect
  headerSection: {
    backgroundColor: '#1e293b',
    padding: '20pt 24pt 24pt 24pt', // Reduced padding
    position: 'relative',
  },
  headerAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '8pt',
    backgroundColor: '#06b6d4',
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
    gap: '8pt',
  },
  title: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    fontFamily: 'Roboto',
    letterSpacing: '1.5pt',
  },
  titleAccent: {
    fontSize: 12,
    color: '#06b6d4',
    textAlign: 'center',
    fontFamily: 'Roboto',
    fontWeight: 'light',
    letterSpacing: '1pt',
    textTransform: 'uppercase',
  },

  // Body
  bodySection: {
    padding: '24pt 24pt', // Reduced from 30pt 28pt
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  },

  body: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '14pt', // Reduced from 18pt
  },

  certifyText: {
    fontSize: 16,
    color: '#475569',
    textAlign: 'center',
    fontFamily: 'Roboto',
    fontWeight: 'light',
    lineHeight: 1.3, // Reduced from 1.4
  },

  nameSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6pt', // Reduced from 8pt
    backgroundColor: '#f8fafc',
    padding: '12pt 18pt', // Reduced padding
    borderLeft: '4pt solid #06b6d4',
  },
  name: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#0f172a',
    textAlign: 'center',
    fontFamily: 'Roboto',
    letterSpacing: '1pt',
  },

  achievementSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12pt', // Reduced from 14pt
    width: '100%',
  },

  courseContainer: {
    backgroundColor: '#1e293b',
    padding: '12pt', // Reduced from 14pt
    borderRadius: '4pt',
    width: '100%',
    maxWidth: '320pt', // Increased from 280pt for better text fit
  },
  course: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    fontFamily: 'Roboto',
    lineHeight: 1.2, // Reduced from 1.3
  },

  instructorSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '5pt',
  },
  offeredBy: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    fontFamily: 'Roboto',
    fontWeight: 'light',
  },
  instructor: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
    textAlign: 'center',
    fontFamily: 'Roboto',
  },

  // Footer
  footerSection: {
    backgroundColor: '#f1f5f9',
    padding: '14pt 24pt', // Reduced padding
    borderTop: '1pt solid #e2e8f0',
  },
  footer: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: '20pt',
  },
  footerBlock: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '8pt',
  },
  footerIcon: {
    width: '12pt',
    height: '12pt',
    backgroundColor: '#06b6d4',
    borderRadius: '9999pt',
  },
  footerContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2pt',
  },
  footerLabel: {
    fontSize: 11,
    color: '#64748b',
    fontFamily: 'Roboto',
    fontWeight: 'light',
    textTransform: 'uppercase',
    letterSpacing: '0.5pt',
  },
  footerValue: {
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'Roboto',
    color: '#1e293b',
  },
});

// Components
const CertificateHeader = ({ title }: { title: string }) => (
  <View style={styles.headerSection}>
    <View style={styles.headerAccent} />
    <View style={styles.header}>
      <Text style={styles.titleAccent}>Certificate of Achievement</Text>
      <Text style={styles.title}>{title}</Text>
    </View>
  </View>
);

const CertificateBody = ({ data }: { data: CertificateData }) => (
  <View style={styles.bodySection}>
    <View style={styles.body}>
      <Text style={styles.certifyText}>{data.certifyText}</Text>

      <View style={styles.nameSection}>
        <Text style={styles.name}>{data.certData.studentName}</Text>
      </View>

      <View style={styles.achievementSection}>
        <Text style={styles.certifyText}>{data.completionText}</Text>

        <View style={styles.courseContainer}>
          <Text style={styles.course}>{data.certData.courseName}</Text>
        </View>

        <View style={styles.instructorSection}>
          <Text style={styles.offeredBy}>{data.offeredBy}</Text>
          <Text style={styles.instructor}>{data.certData.courseLecturer}</Text>
        </View>
      </View>
    </View>
  </View>
);

const CertificateFooter = ({ data }: { data: CertificateData }) => (
  <View style={styles.footerSection}>
    <View style={styles.footer}>
      <View style={styles.footerBlock}>
        <View style={styles.footerIcon} />
        <View style={styles.footerContent}>
          <Text style={styles.footerLabel}>{data.completionDateLabel}</Text>
          <Text style={styles.footerValue}>{data.certData.completionDate}</Text>
        </View>
      </View>

      <View style={styles.footerBlock}>
        <View style={styles.footerContent}>
          <Text style={styles.footerLabel}>{data.certificateIdLabel}</Text>
          <Text style={styles.footerValue}>{data.certData.certificateId}</Text>
        </View>
        <View style={styles.footerIcon} />
      </View>
    </View>
  </View>
);

export const ModernCertificateDocument: React.FC<{ data: CertificateData }> = ({
  data,
}) => (
  <Document>
    <Page size="A4" orientation="landscape" style={styles.page}>
      <View style={styles.container}>
        <Image
          src={`${BASE_URL}/media/logos/watermark.png`}
          style={styles.watermark}
        />
        <CertificateHeader title={data.title} />
        <CertificateBody data={data} />
        <CertificateFooter data={data} />
      </View>
    </Page>
  </Document>
);
