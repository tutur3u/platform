import juice from 'juice';

// Read the dedicated email CSS file
const getEmailCSS = (): string => {
  try {
    // In production, this path would be resolved differently
    // For now, we'll include the CSS inline as a fallback
    return `
      /* Email-safe CSS for ReportPreview component */
      
      body {
        margin: 0;
        padding: 20px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        background: white;
        color: black;
        line-height: 1.5;
      }
      
      .report-container {
        max-width: 100%;
        margin: 0 auto;
        background: white;
        color: black;
      }
      
      .report-content {
        border: 1px solid black;
        border-radius: 8px;
        padding: 32px;
        background: white;
        color: black;
      }
      
      .report-header {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 32px;
        margin-bottom: 16px;
      }
      
      .brand-info {
        text-align: center;
      }
      
      .brand-name {
        font-weight: bold;
        font-size: 18px;
        text-align: center;
        margin-bottom: 8px;
      }
      
      .brand-location {
        font-weight: 600;
        text-align: center;
        margin-bottom: 8px;
      }
      
      .brand-phone {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: center;
        gap: 8px;
        text-align: center;
        font-weight: 600;
        font-size: 14px;
      }
      
      .separator {
        border-top: 1px solid #e5e5e5;
        margin: 16px 0;
      }
      
      .report-title {
        text-align: center;
        font-weight: bold;
        color: black;
        font-size: 18px;
        text-transform: uppercase;
        margin: 16px 0;
      }
      
      .report-intro {
        margin-top: 8px;
        white-space: pre-wrap;
        text-align: left;
        font-size: 14px;
        color: black;
      }
      
      .report-sections {
        margin: 16px 0;
        display: flex;
        flex-direction: row;
        border: 2px solid black;
        border-radius: 4px;
        font-size: 14px;
      }
      
      .report-section {
        flex: 1;
      }
      
      .report-section-content {
        flex: 2;
      }
      
      .report-section-header {
        display: flex;
        height: 80px;
        align-items: center;
        justify-content: center;
        white-space: pre-wrap;
        padding: 8px;
        text-align: center;
        font-weight: bold;
        font-size: 14px;
        color: black;
      }
      
      .report-section-body {
        min-height: 96px;
        border-top: 2px solid black;
        padding: 8px;
        font-weight: 600;
      }
      
      .report-section-left-border {
        border-left: 2px solid black;
      }
      
      .content-body {
        text-overflow: ellipsis;
        white-space: pre-line;
        word-break: break-words;
        text-align: left;
      }
      
      .content-body-center {
        text-align: center;
        text-decoration: underline;
      }
      
      .score-body {
        display: flex;
        min-height: 96px;
        justify-content: center;
        align-items: center;
        text-overflow: ellipsis;
        white-space: pre-line;
        word-break: break-words;
        text-align: center;
      }
      
      .score-value {
        font-weight: bold;
        font-size: 24px;
        text-decoration: underline;
        color: #dc2626;
      }
      
      .score-empty {
        font-weight: 600;
        opacity: 0.5;
      }
      
      .feedback-body {
        text-overflow: ellipsis;
        white-space: pre-line;
        word-break: break-words;
        font-weight: 600;
        text-align: left;
      }
      
      .feedback-body-center {
        text-align: center;
        text-decoration: underline;
      }
      
      .report-footer {
        text-align: left;
        font-size: 14px;
        color: black;
        margin-top: 16px;
      }
      
      .report-closing {
        font-weight: 600;
        color: black;
      }
      
      .text-empty {
        opacity: 0.5;
      }
      
      .mb-8 {
        margin-bottom: 8px;
      }
      
      .mb-16 {
        margin-bottom: 16px;
      }
      
      .font-semibold {
        font-weight: 600;
      }
      
      .font-bold {
        font-weight: bold;
      }
      
      @media only screen and (max-width: 600px) {
        body {
          padding: 10px;
        }
        
        .report-content {
          padding: 16px;
        }
        
        .report-header {
          flex-direction: column;
          gap: 16px;
        }
        
        .report-sections {
          flex-direction: column;
        }
        
        .report-section-left-border {
          border-left: none;
          border-top: 2px solid black;
        }
      }
    `;
  } catch (error) {
    console.error('Failed to read email CSS file:', error);
    return '';
  }
};

/**
 * Inlines CSS styles into HTML using Juice library for better email client compatibility.
 * This replaces the fragile document.styleSheets iteration approach.
 * 
 * @param html The HTML content to inline styles into
 * @param title Optional title for the email
 * @returns HTML string with inlined CSS styles
 */
export const inlineEmailStyles = (html: string, title?: string): string => {
  const emailCSS = getEmailCSS();
  
  // Create a complete HTML document with our dedicated email CSS
  const completeHTML = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${title || 'Report'}</title>
        <style>
          ${emailCSS}
        </style>
      </head>
      <body>
        ${html}
      </body>
    </html>
  `;

  try {
    // Use Juice to inline the CSS styles
    const inlinedHTML = juice(completeHTML, {
      // Juice options for email compatibility
      removeStyleTags: true, // Remove <style> tags after inlining
      preserveMediaQueries: true, // Keep media queries for responsive design
      preserveFontFaces: true, // Keep font-face declarations
      webResources: {
        // Don't try to fetch external resources
        images: false,
        svgs: false,
        scripts: false,
        links: false,
      },
    });

    return inlinedHTML;
  } catch (error) {
    console.error('Failed to inline CSS with Juice:', error);
    // Fallback to the original HTML with CSS in style tags
    return completeHTML;
  }
};

/**
 * Extracts just the body content from inlined HTML for use in email content.
 * This is useful when you only need the body content without the full HTML document structure.
 * 
 * @param inlinedHTML Full HTML document with inlined styles
 * @returns Just the body content with inlined styles
 */
export const extractEmailBody = (inlinedHTML: string): string => {
  try {
    // Extract content between <body> tags
    const bodyMatch = inlinedHTML.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch && bodyMatch[1]) {
      return bodyMatch[1].trim();
    }
    
    // Fallback: return the original content if no body tags found
    return inlinedHTML;
  } catch (error) {
    console.error('Failed to extract email body:', error);
    return inlinedHTML;
  }
};
