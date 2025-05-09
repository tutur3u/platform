import { CertificateData } from './types';
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer';

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

export const CertificateDocument: React.FC<{ data: CertificateData }> = ({
  data,
}) => (
  <Document>
    <Page size="A4" orientation="landscape" style={styles.page}>
      <View style={styles.container}>
        <Image
          src={`${URL}/media/logos/watermark.png`}
          style={styles.watermark}
        />

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
            <Text style={styles.footerValue}>
              {data.certData.completionDate}
            </Text>
          </View>
          <View style={styles.footerBlockRight}>
            <Text style={styles.footerLabelRight}>Certificate ID:</Text>
            <Text style={styles.footerValue}>
              {data.certData.certificateId}
            </Text>
          </View>
        </View>
      </View>
    </Page>
  </Document>
);
