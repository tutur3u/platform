import { createClient } from '@tuturuuu/supabase/next/server';
import { format } from 'date-fns';
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient();

    // Fetch subscription data
    const { data: subscription, error } = await supabase
      .from('workspace_subscription')
      .select('*, workspace_subscription_products(price)')
      .eq('ws_id', wsId)
      .single();

    if (error || !subscription) {
      return NextResponse.json(
        { error: 'Subscription not found' },
        { status: 404 }
      );
    }

    const invoiceHtml = generateInvoiceHtml(subscription);

    return new NextResponse(invoiceHtml, {
      headers: {
        'Content-Type': 'text/html',
        'Content-Disposition': `attachment; filename="invoice-${subscription.id}.html"`,
      },
    });
  } catch (error) {
    console.error('Failed to generate invoice:', error);
    return NextResponse.json(
      { error: 'Failed to generate invoice' },
      { status: 500 }
    );
  }
}

function generateInvoiceHtml(subscription: { plan_name?: string; id: string; workspace_subscription_products?: { price: number } | null; created_at?: string | null; }): string {
  const price = subscription.workspace_subscription_products?.price;
  const amount = price ? `$${price.toFixed(2)}` : '--';
  const date = subscription.created_at
    ? format(new Date(subscription.created_at), 'MMMM d, yyyy')
    : format(new Date(), 'MMMM d, yyyy');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Invoice - ${subscription.id}</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body { 
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          line-height: 1.6;
          color: hsl(222.2 84% 4.9%);
          background: hsl(210 40% 98%);
          min-height: 100vh;
          padding: 2rem;
        }
        
        .invoice-container {
          max-width: 56rem;
          margin: 0 auto;
          background: hsl(0 0% 100%);
          border-radius: 0.75rem;
          border: 1px solid hsl(214.3 31.8% 91.4%);
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
          overflow: hidden;
          animation: slideInFromBottom 0.7s ease-out;
        }
        
        @keyframes slideInFromBottom {
          from {
            opacity: 0;
            transform: translateY(2rem);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .header {
          background: linear-gradient(135deg, hsl(221.2 83.2% 53.3%) 0%, hsl(217.2 91.2% 59.8%) 100%);
          color: hsl(210 40% 98%);
          padding: 3rem;
          text-align: center;
          position: relative;
          overflow: hidden;
        }
        
        .header::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: repeating-linear-gradient(
            45deg,
            transparent,
            transparent 2px,
            rgba(255, 255, 255, 0.05) 2px,
            rgba(255, 255, 255, 0.05) 4px
          );
        }
        
        .header-content {
          position: relative;
          z-index: 1;
          animation: fadeIn 1s ease-out 0.2s both;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        .success-icon {
          width: 4rem;
          height: 4rem;
          background: hsl(142.1 76.2% 36.3%);
          border-radius: 50%;
          margin: 0 auto 1.5rem;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
          color: white;
          animation: zoomIn 0.8s ease-out 0.4s both;
        }
        
        @keyframes zoomIn {
          from {
            opacity: 0;
            transform: scale(0.3);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        
        .header h1 {
          font-size: 2rem;
          margin-bottom: 0.5rem;
          font-weight: 700;
          tracking-tight: -0.025em;
          animation: slideInFromBottom 0.6s ease-out 0.6s both;
        }
        
        .header p {
          font-size: 1rem;
          opacity: 0.9;
          color: hsl(215.4 16.3% 56.9%);
          animation: slideInFromBottom 0.6s ease-out 0.8s both;
        }
        
        .invoice-body {
          padding: 2rem;
        }
        
        .summary-card {
          background: hsl(0 0% 100%);
          border: 1px solid hsl(214.3 31.8% 91.4%);
          border-radius: 0.5rem;
          padding: 2rem;
          margin-bottom: 2rem;
          box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
          animation: slideInFromBottom 0.7s ease-out 0.3s both;
        }
        
        .summary-card h2 {
          font-size: 1.5rem;
          font-weight: 600;
          margin-bottom: 1.5rem;
          color: hsl(222.2 84% 4.9%);
          border-bottom: 2px solid hsl(214.3 31.8% 91.4%);
          padding-bottom: 0.5rem;
        }
        
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
          gap: 1.5rem;
        }
        
        .summary-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem;
          border-radius: 0.375rem;
          transition: all 0.2s ease-in-out;
          border: 1px solid transparent;
        }
        
        .summary-item:hover {
          background: hsl(210 40% 96%);
          transform: scale(1.02);
          border-color: hsl(214.3 31.8% 91.4%);
        }
        
        .summary-label {
          color: hsl(215.4 16.3% 56.9%);
          font-weight: 500;
        }
        
        .summary-value {
          font-weight: 600;
          color: hsl(222.2 84% 4.9%);
        }
        
        .status-badge {
          display: inline-flex;
          align-items: center;
          padding: 0.25rem 0.75rem;
          background: hsl(142.1 76.2% 36.3%);
          color: white;
          border-radius: 9999px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
        
        .details-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          margin: 2rem 0;
          background: hsl(0 0% 100%);
          border: 1px solid hsl(214.3 31.8% 91.4%);
          border-radius: 0.5rem;
          overflow: hidden;
          box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1);
          animation: slideInFromBottom 0.7s ease-out 0.5s both;
        }
        
        .details-table th {
          background: hsl(222.2 84% 4.9%);
          color: hsl(210 40% 98%);
          padding: 1rem;
          text-align: left;
          font-weight: 600;
          font-size: 0.875rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        
        .details-table td {
          padding: 1rem;
          border-bottom: 1px solid hsl(214.3 31.8% 91.4%);
          transition: all 0.2s ease-in-out;
        }
        
        .details-table tbody tr:hover td {
          background: hsl(210 40% 96%);
        }
        
        .details-table tbody tr:last-child td {
          border-bottom: none;
        }
        
        .total-row {
          background: hsl(142.1 76.2% 36.3%) !important;
          color: white !important;
          font-weight: 700;
          font-size: 1.125rem;
        }
        
        .total-row:hover {
          background: hsl(142.1 76.2% 36.3%) !important;
        }
        
        .footer {
          background: hsl(210 40% 96%);
          padding: 2rem;
          text-align: center;
          border-top: 1px solid hsl(214.3 31.8% 91.4%);
          animation: fadeIn 1s ease-out 0.7s both;
        }
        
        .footer .thank-you {
          font-size: 1.25rem;
          color: hsl(222.2 84% 4.9%);
          font-weight: 600;
          margin-bottom: 1rem;
        }
        
        .footer p {
          color: hsl(215.4 16.3% 56.9%);
          margin-bottom: 0.75rem;
          font-size: 0.875rem;
        }
        
        .contact-info {
          margin-top: 1.5rem;
          padding-top: 1.5rem;
          border-top: 1px solid hsl(214.3 31.8% 91.4%);
        }
        
        .contact-info a {
          color: hsl(221.2 83.2% 53.3%);
          text-decoration: none;
          font-weight: 500;
          transition: all 0.2s ease-in-out;
        }
        
        .contact-info a:hover {
          color: hsl(217.2 91.2% 59.8%);
          text-decoration: underline;
          transform: scale(1.05);
          display: inline-block;
        }
        
        @media print {
          body {
            background: white;
            padding: 0;
          }
          
          .invoice-container {
            box-shadow: none;
            border-radius: 0;
            animation: none;
          }
          
          .header-content,
          .summary-card,
          .details-table,
          .footer {
            animation: none;
          }
        }
        
        @media (max-width: 768px) {
          body {
            padding: 1rem;
          }
          
          .header {
            padding: 2rem 1rem;
          }
          
          .header h1 {
            font-size: 1.5rem;
          }
          
          .invoice-body {
            padding: 1rem;
          }
          
          .summary-card {
            padding: 1.5rem;
          }
          
          .summary-grid {
            grid-template-columns: 1fr;
            gap: 1rem;
          }
          
          .details-table th,
          .details-table td {
            padding: 0.75rem;
            font-size: 0.875rem;
          }
        }
      </style>
    </head>
    <body>
      <div class="invoice-container">
        <div class="header">
          <div class="header-content">
            <div class="success-icon">✓</div>
            <h1>Payment Receipt</h1>
            <p>Your subscription has been confirmed successfully</p>
          </div>
        </div>
        
        <div class="invoice-body">
          <div class="summary-card">
            <h2>Payment Summary</h2>
            <div class="summary-grid">
              <div class="summary-item">
                <span class="summary-label">Plan:</span>
                <span class="summary-value">${subscription.plan_name || 'Pro Plan'}</span>
              </div>
              <div class="summary-item">
                <span class="summary-label">Amount:</span>
                <span class="summary-value">${subscription.workspace_subscription_products.price.toFixed(2)}</span>
              </div>
              <div class="summary-item">
                <span class="summary-label">Invoice ID:</span>
                <span class="summary-value">#${subscription.id}</span>
              </div>
              <div class="summary-item">
                <span class="summary-label">Date:</span>
                <span class="summary-value">${date}</span>
              </div>
              <div class="summary-item">
                <span class="summary-label">Payment Method:</span>
                <span class="summary-value">Credit Card</span>
              </div>
              <div class="summary-item">
                <span class="summary-label">Status:</span>
                <span class="status-badge">Paid</span>
              </div>
            </div>
          </div>
          
          <table class="details-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Billing Period</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>${subscription.plan_name || 'Pro Plan'}</strong><br>
                  <small style="color: hsl(215.4 16.3% 56.9%);">Premium subscription with full access</small>
                </td>
                <td>Monthly Subscription</td>
                <td>${amount}</td>
              </tr>
              <tr class="total-row">
                <td colspan="2"><strong>TOTAL AMOUNT</strong></td>
                <td><strong>${amount}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <div class="footer">
          <p class="thank-you">Thank you for your business!</p>
          <p>This receipt was automatically generated and is valid without signature.</p>
          <div class="contact-info">
            <p>
              Questions about this invoice? Contact our support team at 
              <a href="mailto:support@tuturuuu.com">support@tuturuuu.com</a>
            </p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}
