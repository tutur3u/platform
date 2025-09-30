import { Head, Html, Img, Tailwind } from '@tuturuuu/transactional/react/email';

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
    <Tailwind>
      <Html>
        <Head />
        <div className="m-4 rounded-lg border bg-white p-4 font-sans text-black md:p-12">
          {/* Header with Logo and Brand Info */}
          <div className="flex items-center justify-between gap-8">
            {brandLogoUrl && (
              <Img src={brandLogoUrl} alt={`${brandName} Logo`} />
            )}

            <div className="text-center">
              {brandName && (
                <div className="text-center font-bold text-xl">{brandName}</div>
              )}

              {brandLocation && (
                <div
                  className="text-center font-semibold text-wrap whitespace-pre-wrap text-sm"
                  dangerouslySetInnerHTML={{
                    __html: brandLocation.replace(/\n/g, '<br />'),
                  }}
                />
              )}

              {brandPhone && (
                <div className="flex flex-wrap items-center justify-center gap-2 break-keep text-center font-semibold text-sm">
                  {brandPhone}
                </div>
              )}
            </div>
          </div>

          {(brandName || brandLocation || brandPhone) && (
            <div className="my-4 h-px w-full bg-border" />
          )}

          {/* Main Content */}
          <div className="p-3">
            {/* Title */}
            {emailTitle && (
              <div className="text-center font-bold uppercase tracking-wide text-2xl text-blue-700">
                {emailTitle}
              </div>
            )}

            {/* Greeting */}
            {emailGreeting && (
              <div className="mt-2 whitespace-pre-wrap text-left text-sm text-black">
                {emailGreeting}
              </div>
            )}

            {/* Table */}
            <div className="mt-6">
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  border: '1px solid black',
                }}
              >
                <thead>
                  <tr>
                    <th
                      style={{
                        border: '1px solid black',
                        backgroundColor: '#f9fafb',
                        padding: '0.75rem',
                        textAlign: 'center',
                        fontWeight: 700,
                        fontSize: '0.875rem',
                        textTransform: 'uppercase',
                      }}
                    >
                      {tableHeaderComments}
                    </th>
                    <th
                      style={{
                        border: '1px solid black',
                        backgroundColor: '#f9fafb',
                        padding: '0.75rem',
                        textAlign: 'center',
                        fontWeight: 700,
                        fontSize: '0.875rem',
                      }}
                    >
                      {tableHeaderScore}
                      {tableScoreScale && (
                        <div
                          style={{
                            marginTop: '0.25rem',
                            fontWeight: 400,
                            fontSize: '0.75rem',
                            textTransform: 'none',
                          }}
                        >
                          {tableScoreScale}
                        </div>
                      )}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td
                      style={{
                        border: '1px solid black',
                        padding: '1rem',
                        verticalAlign: 'top',
                      }}
                    >
                      <div
                        style={{
                          minHeight: '200px',
                          textAlign: 'justify',
                          fontSize: '0.875rem',
                          lineHeight: '1.625',
                        }}
                      >
                        {comments || emptyCommentsPlaceholder}
                      </div>
                    </td>
                    <td
                      style={{
                        border: '1px solid black',
                        padding: '1rem',
                        textAlign: 'center',
                        verticalAlign: 'top',
                      }}
                    >
                      <div style={{ minHeight: '200px', fontSize: '0.875rem' }}>
                        {avgScore !== undefined
                          ? avgScore
                          : emptyScorePlaceholder}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Footer */}
            {emailFooter && (
              <div className="mt-4 whitespace-pre-wrap text-left text-sm text-black">
                {emailFooter}
              </div>
            )}

            {/* Signature */}
            {(signatureTitle || signatureName) && (
              <div className="mt-8 text-center">
                {signatureTitle && (
                  <div className="font-semibold text-sm italic">
                    {signatureTitle}
                  </div>
                )}
                {signatureName && (
                  <div className="font-bold text-sm">{signatureName}</div>
                )}
              </div>
            )}
          </div>
        </div>
      </Html>
    </Tailwind>
  );
};

export default LeadGenerationEmailTemplate;
