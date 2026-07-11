interface BuildReportPrintContentOptions {
  printableAreaHtml: string;
  documentTitle: string;
  stylesheets: string;
}

export function buildReportPrintContent({
  printableAreaHtml,
  documentTitle,
  stylesheets,
}: BuildReportPrintContentOptions): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>${documentTitle}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        ${stylesheets}
        <style>
          @page {
            size: A4;
            margin: 0;
          }
          body {
            margin: 0;
            padding: 24px;
            font-family: system-ui, -apple-system, sans-serif;
            background: #e2e8f0;
            color: black;
          }
          #printable-area {
            display: flex;
            flex-direction: column;
            gap: 24px;
          }
          [data-report-page] {
            break-after: page;
            page-break-after: always;
          }
          [data-report-page]:last-child {
            break-after: auto;
            page-break-after: auto;
          }
          @media print {
            body {
              margin: 0;
              padding: 0;
              background: white;
            }
            #printable-area {
              display: block !important;
              gap: 0 !important;
              height: auto !important;
              max-width: none !important;
              border: none !important;
              border-radius: 0 !important;
              box-shadow: none !important;
              margin: 0 !important;
              background: white !important;
              color: black !important;
              width: auto !important;
            }
            [data-report-page] {
              box-shadow: none !important;
              margin: 0 !important;
              min-height: 297mm !important;
              width: 210mm !important;
            }
            .print\\:hidden {
              display: none !important;
            }
            .print\\:text-black {
              color: black !important;
            }
            .print\\:bg-white {
              background-color: white !important;
            }
            .print\\:border-black {
              border-color: black !important;
            }
            .print\\:text-red-600 {
              color: #dc2626 !important;
            }
            .print\\:border-0 {
              border: none !important;
            }
            .print\\:rounded-none {
              border-radius: 0 !important;
            }
            .print\\:h-auto {
              height: auto !important;
            }
            .print\\:p-8 {
              padding: 2rem !important;
            }
            .print\\:w-auto {
              width: auto !important;
            }
            .print\\:max-w-none {
              max-width: none !important;
            }
            .print\\:shadow-none {
              box-shadow: none !important;
            }
            .print\\:m-0 {
              margin: 0 !important;
            }
            .print\\:p-4 {
              padding: 1rem !important;
            }
            .print\\:opacity-50 {
              opacity: 0.5 !important;
            }
            .print\\:break-after-page {
              break-after: page !important;
              page-break-after: always !important;
            }
            .print\\:break-after-auto {
              break-after: auto !important;
              page-break-after: auto !important;
            }
          }
        </style>
      </head>
      <body>
        ${printableAreaHtml}
        <script>
          window.onload = function() {
            setTimeout(() => {
              window.print();
              window.onafterprint = function() {
                window.close();
              };
            }, 500);
          };
        </script>
      </body>
    </html>
  `;
}
