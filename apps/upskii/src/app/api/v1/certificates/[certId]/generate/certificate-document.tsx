import { BASE_URL } from '@/constants/common';
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer';
import { CertificateData } from './types';

// Register fonts
Font.register({
  family: 'Roboto',
  fonts: [
    { src: `${BASE_URL}/fonts/Roboto-Regular.ttf` },
    { src: `${BASE_URL}/fonts/Roboto-Medium.ttf`, fontWeight: 'medium' },
    { src: `${BASE_URL}/fonts/Roboto-Bold.ttf`, fontWeight: 'bold' },
    { src: `${BASE_URL}/fonts/Roboto-Light.ttf`, fontWeight: 'light' },
  ],
});

// Styles
const styles = StyleSheet.create({
  // Layout
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

  // Header
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
    fontFamily: 'Roboto',
  },
  separator: {
    height: 1,
    backgroundColor: '#0a0a0a',
    width: '100%',
  },

  // Body
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
    fontFamily: 'Roboto',
    fontWeight: 'light',
  },
  name: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
    fontFamily: 'Roboto',
  },
  course: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
    fontFamily: 'Roboto',
  },
  instructor: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
    fontFamily: 'Roboto',
  },

  // Footer
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
    fontFamily: 'Roboto',
    fontWeight: 'light',
  },
  footerValue: {
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'Courier',
  },
});

// Components
const CertificateHeader = ({ title }: { title: string }) => (
  <View style={styles.header}>
    <Text style={styles.title}>{title}</Text>
    <View style={styles.separator} />
  </View>
);

const CertificateBody = ({ data }: { data: CertificateData }) => (
  <View style={styles.body}>
    <Text style={styles.subtitle}>{data.certifyText}</Text>
    <Text style={styles.name}>{data.certData.studentName}</Text>
    <Text style={styles.subtitle}>{data.completionText}</Text>
    <Text style={styles.course}>{data.certData.courseName}</Text>
    <Text style={styles.subtitle}>{data.offeredBy}</Text>
    <Text style={styles.instructor}>{data.certData.courseLecturer}</Text>
  </View>
);

const CertificateFooter = ({ data }: { data: CertificateData }) => (
  <View style={styles.footer}>
    <View style={styles.footerBlock}>
      <Text style={styles.footerLabel}>{data.completionDateLabel}:</Text>
      <Text style={styles.footerValue}>{data.certData.completionDate}</Text>
    </View>
    <View style={styles.footerBlockRight}>
      <Text style={styles.footerLabel}>{data.certificateIdLabel}:</Text>
      <Text style={styles.footerValue}>{data.certData.certificateId}</Text>
    </View>
  </View>
);

export const CertificateDocument: React.FC<{ data: CertificateData }> = ({ data }) => (
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
