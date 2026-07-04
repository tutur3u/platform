import {
  Body,
  Column,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Row,
  Section,
  Tailwind,
  Text,
} from '@tuturuuu/transactional/react/email';

interface Props {
  // Dynamic replacements
  leadName?: string;
  className?: string;
  teacherName?: string;
  avgScore?: number;
  comments?: string;
  currentDate?: string;
  minimumAttendance?: number;

  // 🔴 REQUIRED CONFIG VARIABLES - Reuses existing report config variables:

  // Brand/Header configs (shared with report-preview)
  brandLogoUrl: string; // BRAND_LOGO_URL - Logo image URL
  brandName: string; // BRAND_NAME - Organization name
  brandLocation?: string; // BRAND_LOCATION - Location address (supports multiple lines with \n)
  brandPhone: string; // BRAND_PHONE_NUMBER - Contact phone number

  // Email content configs
  emailTitle: string; // LEAD_EMAIL_TITLE - Main email title
  emailGreeting: string; // LEAD_EMAIL_GREETING - Opening greeting text
  // Supports: {{leadName}}, {{className}}, {{teacherName}}, {{currentDate}}

  // Table configs
  tableHeaderComments: string; // LEAD_EMAIL_TABLE_HEADER_COMMENTS - Left column header
  tableHeaderScore: string; // LEAD_EMAIL_TABLE_HEADER_SCORE - Right column header
  tableScoreScale?: string; // LEAD_EMAIL_TABLE_SCORE_SCALE - Score scale description

  // Footer configs
  emailFooter: string; // LEAD_EMAIL_FOOTER - Closing message/footer text
  signatureTitle: string; // LEAD_EMAIL_SIGNATURE_TITLE - Signer's title
  signatureName: string; // LEAD_EMAIL_SIGNATURE_NAME - Signer's name

  // 🟡 OPTIONAL CONFIG VARIABLES - Can be added for more flexibility:
  emptyCommentsPlaceholder?: string; // LEAD_EMAIL_EMPTY_COMMENTS - Placeholder when no comments
  emptyScorePlaceholder?: string; // LEAD_EMAIL_EMPTY_SCORE - Placeholder when no score
}

const LeadGenerationEmailTemplate = ({
  avgScore,
  comments,
  brandLogoUrl,
  brandName,
  brandLocation,
  brandPhone,
  emailTitle,
  emailGreeting,
  tableHeaderComments,
  tableHeaderScore,
  tableScoreScale,
  emailFooter,
  signatureTitle,
  signatureName,
  emptyCommentsPlaceholder = '...........................................................',
  emptyScorePlaceholder = '...',
}: Props) => {
  return (
    <Html>
      <Head />
      <Tailwind>
        <Body
          style={{
            fontFamily: 'Arial, sans-serif',
            backgroundColor: '#f9fafb',
          }}
        >
          <Container
            style={{
              margin: '16px auto',
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              overflow: 'hidden',
            }}
            className="max-w-[800px]"
          >
            {/* Header Section - Standard Layout */}
            <Section className="px-6 py-4">
              <Row>
                <Column
                  style={{
                    padding: '0 12px',
                    verticalAlign: 'middle',
                  }}
                >
                  {brandLogoUrl && (
                    <Img
                      src={brandLogoUrl}
                      alt={`${brandName} Logo`}
                      style={{
                        display: 'block',
                        marginLeft: 'auto',
                        marginRight: 'auto',
                        maxWidth: '100%',
                        height: 'auto',
                      }}
                    />
                  )}
                </Column>
                <Column
                  style={{
                    padding: '0 12px',
                    verticalAlign: 'middle',
                  }}
                >
                  {brandName && (
                    <Text
                      style={{
                        fontSize: '20px',
                        fontWeight: 'bold',
                        color: '#000000',
                        textAlign: 'center',
                      }}
                    >
                      {brandName}
                    </Text>
                  )}

                  {brandLocation && (
                    <Text
                      style={{
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#374151',
                        margin: '0 0 8px 0',
                        textAlign: 'center',
                        lineHeight: '1.4',
                        whiteSpace: 'pre-line',
                      }}
                    >
                      {brandLocation}
                    </Text>
                  )}

                  {brandPhone && (
                    <Text
                      style={{
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#374151',
                        margin: '0 0 16px 0',
                        textAlign: 'center',
                        lineHeight: '1.4',
                      }}
                    >
                      {brandPhone}
                    </Text>
                  )}
                </Column>
              </Row>
            </Section>

            {/* Divider */}
            {(brandName || brandLocation || brandPhone) && (
              <Hr
                style={{
                  borderColor: '#e5e7eb',
                }}
              />
            )}

            {/* Main Content */}
            <Section style={{ padding: '24px' }}>
              {/* Title */}
              {emailTitle && (
                <Text
                  style={{
                    fontSize: '24px',
                    fontWeight: 'bold',
                    textAlign: 'center',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: '#1d4ed8',
                    margin: '0 0 24px 0',
                    lineHeight: '1.2',
                  }}
                >
                  {emailTitle}
                </Text>
              )}

              {/* Greeting */}
              {emailGreeting && (
                <Text
                  style={{
                    fontSize: '14px',
                    color: '#000000',
                    lineHeight: '1.6',
                    margin: '0 0 24px 0',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {emailGreeting}
                </Text>
              )}

              {/* Data Table - Using ReactEmail Row/Column approach */}
              <Section style={{ margin: '32px 0' }}>
                {/* Table Header */}
                <Row
                  style={{
                    border: '2px solid #000000',
                    borderBottom: '1px solid #000000',
                  }}
                >
                  <Column
                    style={{
                      border: '1px solid #000000',
                      borderRight: '1px solid #000000',
                      backgroundColor: '#f3f4f6',
                      padding: '16px',
                      textAlign: 'center',
                      width: '70%',
                    }}
                  >
                    <Text
                      style={{
                        fontWeight: 'bold',
                        fontSize: '14px',
                        textTransform: 'uppercase',
                        color: '#000000',
                        margin: '0',
                      }}
                    >
                      {tableHeaderComments}
                    </Text>
                  </Column>
                  <Column
                    style={{
                      border: '1px solid #000000',
                      backgroundColor: '#f3f4f6',
                      padding: '16px',
                      textAlign: 'center',
                      width: '30%',
                    }}
                  >
                    <Text
                      style={{
                        fontWeight: 'bold',
                        fontSize: '14px',
                        color: '#000000',
                        margin: '0',
                      }}
                    >
                      {tableHeaderScore}
                    </Text>
                    {tableScoreScale && (
                      <Text
                        style={{
                          margin: '6px 0 0 0',
                          fontWeight: 'normal',
                          fontSize: '12px',
                          textTransform: 'none',
                          color: '#6b7280',
                        }}
                      >
                        {tableScoreScale}
                      </Text>
                    )}
                  </Column>
                </Row>

                {/* Table Body */}
                <Row
                  style={{
                    border: '2px solid #000000',
                    borderTop: 'none',
                  }}
                >
                  <Column
                    style={{
                      border: '1px solid #000000',
                      borderRight: '1px solid #000000',
                      padding: '20px',
                      width: '70%',
                    }}
                  >
                    <Text
                      style={{
                        minHeight: '200px',
                        textAlign: 'justify',
                        fontSize: '14px',
                        lineHeight: '1.6',
                        color: '#000000',
                        margin: '0',
                      }}
                    >
                      {comments || emptyCommentsPlaceholder}
                    </Text>
                  </Column>
                  <Column
                    style={{
                      border: '1px solid #000000',
                      padding: '20px',
                      textAlign: 'center',
                      width: '30%',
                    }}
                  >
                    <Text
                      style={{
                        minHeight: '200px',
                        fontSize: '18px',
                        color: '#000000',
                        fontWeight: 'bold',
                        margin: '0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {avgScore !== undefined
                        ? avgScore
                        : emptyScorePlaceholder}
                    </Text>
                  </Column>
                </Row>
              </Section>

              {/* Footer */}
              {emailFooter && (
                <Text
                  style={{
                    fontSize: '14px',
                    color: '#000000',
                    lineHeight: '1.6',
                    margin: '32px 0 0 0',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {emailFooter}
                </Text>
              )}

              {/* Signature */}
              {(signatureTitle || signatureName) && (
                <Section style={{ textAlign: 'center', marginTop: '40px' }}>
                  {signatureTitle && (
                    <Text
                      style={{
                        fontSize: '14px',
                        fontWeight: '600',
                        fontStyle: 'italic',
                        color: '#000000',
                        margin: '0 0 4px 0',
                      }}
                    >
                      {signatureTitle}
                    </Text>
                  )}
                  {signatureName && (
                    <Text
                      style={{
                        fontSize: '14px',
                        fontWeight: 'bold',
                        color: '#000000',
                        margin: '0',
                      }}
                    >
                      {signatureName}
                    </Text>
                  )}
                </Section>
              )}
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default LeadGenerationEmailTemplate;
