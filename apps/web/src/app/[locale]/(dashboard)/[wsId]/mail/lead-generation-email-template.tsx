import { Head, Html, Img, Tailwind } from '@tuturuuu/transactional/react/email';

interface Props {
  // Dynamic replacements
  leadName?: string;
  className?: string;
  teacherName?: string;
  avgScore?: number;
  comments?: string;
  currentDate?: string;

  // 🔴 REQUIRED CONFIG VARIABLES - Reuses existing report config variables:
  
  // Brand/Header configs (shared with report-preview)
  brandLogoUrl: string;              // BRAND_LOGO_URL - Logo image URL
  brandName: string;                 // BRAND_NAME - Organization name
  brandLocation?: string;            // BRAND_LOCATION - Location address (supports multiple lines with \n)
  brandPhone: string;                // BRAND_PHONE_NUMBER - Contact phone number
  
  // Email content configs
  emailTitle: string;                // LEAD_EMAIL_TITLE - Main email title
  emailGreeting: string;             // LEAD_EMAIL_GREETING - Opening greeting text
                                     // Supports: {{leadName}}, {{className}}, {{teacherName}}, {{currentDate}}
  
  // Table configs
  tableHeaderComments: string;       // LEAD_EMAIL_TABLE_HEADER_COMMENTS - Left column header
  tableHeaderScore: string;          // LEAD_EMAIL_TABLE_HEADER_SCORE - Right column header
  tableScoreScale?: string;          // LEAD_EMAIL_TABLE_SCORE_SCALE - Score scale description
  
  // Footer configs
  emailFooter: string;               // LEAD_EMAIL_FOOTER - Closing message/footer text
  signatureTitle: string;            // LEAD_EMAIL_SIGNATURE_TITLE - Signer's title
  signatureName: string;             // LEAD_EMAIL_SIGNATURE_NAME - Signer's name
  
  // 🟡 OPTIONAL CONFIG VARIABLES - Can be added for more flexibility:
  brandLogoWidth?: string;           // LEAD_EMAIL_BRAND_LOGO_WIDTH - Logo width (default: "100")
  brandLogoHeight?: string;          // LEAD_EMAIL_BRAND_LOGO_HEIGHT - Logo height (default: "38")
  titleColor?: string;               // LEAD_EMAIL_TITLE_COLOR - Title text color (default: "blue-700")
  emptyCommentsPlaceholder?: string; // LEAD_EMAIL_EMPTY_COMMENTS - Placeholder when no comments
  emptyScorePlaceholder?: string;    // LEAD_EMAIL_EMPTY_SCORE - Placeholder when no score
}

const LeadGenerationEmailTemplate = ({
  leadName,
  className,
  teacherName,
  avgScore,
  comments,
  currentDate,
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
  brandLogoWidth = '100',
  brandLogoHeight = '38',
  titleColor = 'blue-700',
  emptyCommentsPlaceholder = '...........................................................',
  emptyScorePlaceholder = '...',
}: Props) => {
  // Parse dynamic text with variable replacements
  const parseDynamicText = (text: string): string => {
    return text
      .replace(/{{leadName}}/g, leadName || '')
      .replace(/{{className}}/g, className || '')
      .replace(/{{teacherName}}/g, teacherName || '')
      .replace(/{{currentDate}}/g, currentDate || new Date().toLocaleDateString())
      .replace(/{{avgScore}}/g, avgScore?.toString() || '');
  };

  return (
    <Html>
      <Head />
      <Tailwind>
        <div className="m-4 rounded-lg border bg-white p-6 font-sans text-[14px] text-black leading-6">
          {/* Header */}
          <div className="text-center">
            <Img
              src={brandLogoUrl}
              width={brandLogoWidth}
              height={brandLogoHeight}
              alt={`${brandName} Logo`}
              className="mx-auto"
            />
            <div className="mt-2 font-bold text-lg">{brandName}</div>
            {brandLocation && (
              <div
                className="text-sm"
                dangerouslySetInnerHTML={{
                  __html: brandLocation.replace(/\n/g, '<br />'),
                }}
              />
            )}
            <div className="mt-1 text-sm">{brandPhone}</div>
          </div>

          {/* Title */}
          <div
            className={`mt-4 text-center font-bold text-${titleColor} text-lg uppercase`}
          >
            {emailTitle}
          </div>

          {/* Greeting */}
          <p className="mt-4 whitespace-pre-line">
            {parseDynamicText(emailGreeting)}
          </p>

          {/* Comments + Score Table */}
          <table className="mt-4 w-full border-collapse border border-black text-sm">
            <thead>
              <tr>
                <th className="w-[70%] border border-black p-2 text-center">
                  {tableHeaderComments}
                </th>
                <th className="w-[30%] border border-black p-2 text-center">
                  {tableHeaderScore}
                  {tableScoreScale && (
                    <>
                      {' '}
                      <br /> {tableScoreScale}
                    </>
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="whitespace-pre-line border border-black p-4 align-top">
                  {comments || emptyCommentsPlaceholder}
                </td>
                <td className="border border-black p-4 text-center align-top">
                  {avgScore !== undefined ? avgScore : emptyScorePlaceholder}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Footer Note */}
          <p className="mt-4 text-sm whitespace-pre-line">
            {parseDynamicText(emailFooter)}
          </p>

          {/* Signature */}
          <div className="mt-6 text-right font-semibold">
            {signatureTitle}
            <br />
            {signatureName}
          </div>
        </div>
      </Tailwind>
    </Html>
  );
};

export default LeadGenerationEmailTemplate;
