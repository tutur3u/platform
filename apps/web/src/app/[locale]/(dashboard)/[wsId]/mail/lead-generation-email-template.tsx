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
         <div
           style={{
             margin: '16px',
             borderRadius: '8px',
             border: '1px solid #e5e7eb',
             backgroundColor: '#ffffff',
             padding: '16px',
             fontFamily: 'Arial, sans-serif',
             color: '#000000',
           }}
           className="md:p-12"
         >
           {/* Email-Safe Responsive CSS */}
           <style>{`
             @media only screen and (min-width: 600px) {
               .mobile-header { display: none !important; }
               .desktop-header { display: block !important; }
             }
             @media only screen and (max-width: 599px) {
               .mobile-header { display: block !important; }
               .desktop-header { display: none !important; }
             }
           `}</style>
           {/* Header with Logo and Brand Info - Email-Safe Responsive */}
           <div style={{ marginBottom: '20px' }}>
             {/* Mobile Layout - Stacked (default for email clients) */}
             <div
               className="mobile-header"
               style={{
                 display: 'block',
                 textAlign: 'center',
                 width: '100%',
                 maxWidth: '100%',
               }}
             >
               {brandLogoUrl && (
                 <div style={{ marginBottom: '16px' }}>
                   <Img src={brandLogoUrl} alt={`${brandName} Logo`} />
                 </div>
               )}

               {brandName && (
                 <div
                   style={{
                     fontSize: '20px',
                     fontWeight: 'bold',
                     color: '#000000',
                     textAlign: 'center',
                     marginBottom: '8px',
                   }}
                 >
                   {brandName}
                 </div>
               )}

               {brandLocation && (
                 <div
                   style={{
                     fontSize: '14px',
                     fontWeight: '600',
                     color: '#374151',
                     textAlign: 'center',
                     whiteSpace: 'pre-wrap',
                     wordWrap: 'break-word',
                     marginBottom: '8px',
                     lineHeight: '1.4',
                   }}
                   dangerouslySetInnerHTML={{
                     __html: brandLocation.replace(/\n/g, '<br />'),
                   }}
                 />
               )}

               {brandPhone && (
                 <div
                   style={{
                     fontSize: '14px',
                     fontWeight: '600',
                     color: '#374151',
                     textAlign: 'center',
                     wordBreak: 'break-word',
                     lineHeight: '1.4',
                   }}
                 >
                   {brandPhone}
                 </div>
               )}
             </div>

             {/* Desktop Layout - Side by Side (hidden by default, shown via CSS) */}
             <div
               className="desktop-header"
               style={{
                 display: 'none',
                 width: '100%',
               }}
             >
               <table
                 style={{
                   width: '100%',
                   borderCollapse: 'collapse',
                 }}
               >
                 <tr>
                   <td
                     style={{
                       width: '40%',
                       verticalAlign: 'top',
                       paddingRight: '20px',
                     }}
                   >
                     {brandLogoUrl && (
                       <Img src={brandLogoUrl} alt={`${brandName} Logo`} />
                     )}
                   </td>
                   <td
                     style={{
                       width: '60%',
                       verticalAlign: 'top',
                       textAlign: 'center',
                     }}
                   >
                     {brandName && (
                       <div
                         style={{
                           fontSize: '20px',
                           fontWeight: 'bold',
                           color: '#000000',
                           textAlign: 'center',
                           marginBottom: '8px',
                         }}
                       >
                         {brandName}
                       </div>
                     )}

                     {brandLocation && (
                       <div
                         style={{
                           fontSize: '14px',
                           fontWeight: '600',
                           color: '#374151',
                           textAlign: 'center',
                           whiteSpace: 'pre-wrap',
                           wordWrap: 'break-word',
                           marginBottom: '8px',
                         }}
                         dangerouslySetInnerHTML={{
                           __html: brandLocation.replace(/\n/g, '<br />'),
                         }}
                       />
                     )}

                     {brandPhone && (
                       <div
                         style={{
                           fontSize: '14px',
                           fontWeight: '600',
                           color: '#374151',
                           textAlign: 'center',
                           wordBreak: 'break-word',
                         }}
                       >
                         {brandPhone}
                       </div>
                     )}
                   </td>
                 </tr>
               </table>
             </div>
           </div>

          {(brandName || brandLocation || brandPhone) && (
            <div
              style={{
                margin: '20px 0',
                height: '1px',
                width: '100%',
                backgroundColor: '#e5e7eb',
              }}
            />
          )}

          {/* Main Content */}
          <div style={{ padding: '20px 12px' }}>
            {/* Title */}
            {emailTitle && (
              <div
                style={{
                  fontSize: '24px',
                  fontWeight: 'bold',
                  textAlign: 'center',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#1d4ed8',
                  marginBottom: '24px',
                  lineHeight: '1.2',
                }}
              >
                {emailTitle}
              </div>
            )}

            {/* Greeting */}
            {emailGreeting && (
              <div
                style={{
                  marginBottom: '24px',
                  whiteSpace: 'pre-wrap',
                  textAlign: 'left',
                  fontSize: '14px',
                  color: '#000000',
                  lineHeight: '1.6',
                }}
              >
                {emailGreeting}
              </div>
            )}

            {/* Table */}
            <div style={{ marginTop: '32px' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  border: '2px solid #000000',
                }}
              >
                <thead>
                  <tr>
                    <th
                      style={{
                        border: '1px solid #000000',
                        backgroundColor: '#f3f4f6',
                        padding: '16px',
                        textAlign: 'center',
                        fontWeight: 'bold',
                        fontSize: '14px',
                        textTransform: 'uppercase',
                        color: '#000000',
                      }}
                    >
                      {tableHeaderComments}
                    </th>
                    <th
                      style={{
                        border: '1px solid #000000',
                        backgroundColor: '#f3f4f6',
                        padding: '16px',
                        textAlign: 'center',
                        fontWeight: 'bold',
                        fontSize: '14px',
                        color: '#000000',
                      }}
                    >
                      {tableHeaderScore}
                      {tableScoreScale && (
                        <div
                          style={{
                            marginTop: '6px',
                            fontWeight: 'normal',
                            fontSize: '12px',
                            textTransform: 'none',
                            color: '#6b7280',
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
                        border: '1px solid #000000',
                        padding: '20px',
                        verticalAlign: 'top',
                        width: '70%',
                      }}
                    >
                      <div
                        style={{
                          minHeight: '200px',
                          textAlign: 'justify',
                          fontSize: '14px',
                          lineHeight: '1.6',
                          color: '#000000',
                        }}
                      >
                        {comments || emptyCommentsPlaceholder}
                      </div>
                    </td>
                    <td
                      style={{
                        border: '1px solid #000000',
                        padding: '20px',
                        textAlign: 'center',
                        verticalAlign: 'top',
                        width: '30%',
                      }}
                    >
                      <div
                        style={{
                          minHeight: '200px',
                          fontSize: '18px',
                          color: '#000000',
                          fontWeight: 'bold',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
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
              <div
                style={{
                  marginTop: '32px',
                  whiteSpace: 'pre-wrap',
                  textAlign: 'left',
                  fontSize: '14px',
                  color: '#000000',
                  lineHeight: '1.6',
                }}
              >
                {emailFooter}
              </div>
            )}

            {/* Signature */}
            {(signatureTitle || signatureName) && (
              <div style={{ marginTop: '40px', textAlign: 'center' }}>
                {signatureTitle && (
                  <div
                    style={{
                      fontSize: '14px',
                      fontWeight: '600',
                      fontStyle: 'italic',
                      color: '#000000',
                      marginBottom: '4px',
                    }}
                  >
                    {signatureTitle}
                  </div>
                )}
                {signatureName && (
                  <div
                    style={{
                      fontSize: '14px',
                      fontWeight: 'bold',
                      color: '#000000',
                    }}
                  >
                    {signatureName}
                  </div>
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
