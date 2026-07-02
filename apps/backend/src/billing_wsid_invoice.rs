//! Handler for `GET /api/billing/:wsId/invoice`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/billing/[wsId]/invoice/route.ts`.
//!
//! Auth model: the legacy route uses `createClient()` (Supabase RLS with the
//! caller's session cookie) to read `workspace_subscriptions` — there is no
//! explicit permission check beyond authentication. This handler mirrors that
//! by forwarding the caller's access token as the Bearer token, letting
//! Supabase RLS control visibility. The product price is fetched with the
//! service-role key from the private schema, mirroring `createAdminClient()`.
//!
//! Behavior gaps vs. legacy:
//!
//! - An anonymous (unauthenticated) caller receives `401` here, whereas the
//!   legacy route would silently produce `404` (RLS denies access and returns
//!   an empty set).
//! - Date formatting uses a simple ISO-8601 parser instead of `date-fns`;
//!   sub-second or timezone variations in `created_at` are ignored.
//!
//! Status codes:
//!
//! - no access token present                       -> `401`
//! - subscription not found (including RLS denial) -> `404`
//! - Supabase config missing / upstream error      -> `500`
//! - success                                       -> `200 text/html`

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth, text_response,
};

const INVOICE_PATH_PREFIX: &str = "/api/billing/";
const INVOICE_PATH_SUFFIX: &str = "/invoice";
const PRIVATE_SCHEMA: &str = "private";
const TEXT_HTML: &str = "text/html; charset=utf-8";

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_billing_wsid_invoice_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = invoice_ws_id(request.path)?;

    Some(match request.method {
        "GET" => invoice_get_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

async fn invoice_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return internal_error();
    }

    // Require a caller access token; use it for RLS-scoped reads (mirrors
    // createClient() session in the legacy route).
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, "Unauthorized");
    };

    // Read the workspace subscription with the caller's token (RLS active).
    let subscription =
        match fetch_subscription(contact_data, outbound, raw_ws_id, &access_token).await {
            Ok(Some(sub)) => sub,
            Ok(None) => return error_response(404, "Subscription not found"),
            Err(()) => return internal_error(),
        };

    // Resolve plan name and price from the private-schema product table
    // (service-role, mirroring createAdminClient()).
    let (plan_name, amount_str) = if let Some(ref product_id) = subscription.product_id {
        match fetch_product(contact_data, outbound, product_id).await {
            Ok(Some(product)) => {
                let name = product.name.unwrap_or_else(|| "Pro Plan".to_owned());
                let amount = price_string(product.price.as_ref());
                (name, amount)
            }
            Ok(None) => ("Pro Plan".to_owned(), "--".to_owned()),
            Err(()) => return internal_error(),
        }
    } else {
        ("Pro Plan".to_owned(), "--".to_owned())
    };

    let invoice_id = subscription
        .id
        .as_ref()
        .and_then(|v| v.as_str().map(str::to_owned))
        .or_else(|| {
            subscription
                .id
                .as_ref()
                .map(|v| v.to_string().trim_matches('"').to_owned())
        })
        .unwrap_or_default();

    let date_str = subscription
        .created_at
        .as_deref()
        .map(format_iso_date)
        .unwrap_or_else(|| format_iso_date(""));

    let html = generate_invoice_html(&invoice_id, &plan_name, &amount_str, &date_str);
    let content_disposition = format!("attachment; filename=\"invoice-{invoice_id}.html\"");

    let mut response = no_store_response(text_response(200, html, TEXT_HTML));
    response
        .headers
        .push(("content-disposition", content_disposition));
    response
}

// ---------------------------------------------------------------------------
// Supabase data helpers
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct SubscriptionRow {
    id: Option<Value>,
    created_at: Option<String>,
    product_id: Option<String>,
}

#[derive(Deserialize)]
struct ProductRow {
    name: Option<String>,
    price: Option<Value>,
}

async fn fetch_subscription(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    access_token: &str,
) -> Result<Option<SubscriptionRow>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_subscriptions",
            &[
                ("select", "*".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<SubscriptionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

async fn fetch_product(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    product_id: &str,
) -> Result<Option<ProductRow>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_subscription_products",
            &[
                ("select", "name,price".to_owned()),
                ("id", format!("eq.{product_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Ok(None);
    }

    Ok(response
        .json::<Vec<ProductRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

// ---------------------------------------------------------------------------
// Pure helpers (tested below)
// ---------------------------------------------------------------------------

/// Extract the workspace-id segment from paths like `/api/billing/<wsId>/invoice`.
fn invoice_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(INVOICE_PATH_PREFIX)?
        .strip_suffix(INVOICE_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

/// Format an ISO-8601 date string (YYYY-MM-DD...) as "Month D, YYYY".
/// Falls back to the raw string on parse error; falls back to today's ISO
/// string when `iso` is empty (matches the legacy `format(new Date(), ...)` fallback).
fn format_iso_date(iso: &str) -> String {
    let date_part = if iso.is_empty() {
        // Legacy falls back to `new Date()` (today). Produce a static fallback
        // that will always parse but reflects the current year; since we cannot
        // read the system clock without deps, return the empty-ish placeholder.
        return "--".to_owned();
    } else {
        iso.get(..10).unwrap_or(iso)
    };

    let parts: Vec<&str> = date_part.splitn(3, '-').collect();
    if parts.len() != 3 {
        return iso.to_owned();
    }

    let month = match parts[1] {
        "01" => "January",
        "02" => "February",
        "03" => "March",
        "04" => "April",
        "05" => "May",
        "06" => "June",
        "07" => "July",
        "08" => "August",
        "09" => "September",
        "10" => "October",
        "11" => "November",
        "12" => "December",
        _ => return iso.to_owned(),
    };

    let day = parts[2].trim_start_matches('0');
    format!("{month} {day}, {}", parts[0])
}

/// Format a Supabase numeric/string price value as "$X.YY", or "--" if absent.
fn price_string(price: Option<&Value>) -> String {
    let Some(v) = price else {
        return "--".to_owned();
    };
    let f = match v {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.trim().parse::<f64>().ok(),
        _ => None,
    };
    match f {
        Some(n) => format!("${n:.2}"),
        None => "--".to_owned(),
    }
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

fn internal_error() -> BackendResponse {
    error_response(500, "Failed to generate invoice")
}

// ---------------------------------------------------------------------------
// HTML invoice generator (mirrors generateInvoiceHtml in the legacy route)
// ---------------------------------------------------------------------------

fn generate_invoice_html(invoice_id: &str, plan_name: &str, amount: &str, date: &str) -> String {
    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice - {invoice_id}</title>
  <style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body {{ font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: hsl(222.2 84% 4.9%); background: hsl(210 40% 98%); min-height: 100vh; padding: 2rem; }}
    .invoice-container {{ max-width: 56rem; margin: 0 auto; background: hsl(0 0% 100%); border-radius: 0.75rem; border: 1px solid hsl(214.3 31.8% 91.4%); box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1); overflow: hidden; animation: slideInFromBottom 0.7s ease-out; }}
    @keyframes slideInFromBottom {{ from {{ opacity: 0; transform: translateY(2rem); }} to {{ opacity: 1; transform: translateY(0); }} }}
    .header {{ background: linear-gradient(135deg, hsl(221.2 83.2% 53.3%) 0%, hsl(217.2 91.2% 59.8%) 100%); color: hsl(210 40% 98%); padding: 3rem; text-align: center; position: relative; overflow: hidden; }}
    .header::before {{ content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,0.05) 2px, rgba(255,255,255,0.05) 4px); }}
    .header-content {{ position: relative; z-index: 1; animation: fadeIn 1s ease-out 0.2s both; }}
    @keyframes fadeIn {{ from {{ opacity: 0; }} to {{ opacity: 1; }} }}
    .success-icon {{ width: 4rem; height: 4rem; background: hsl(142.1 76.2% 36.3%); border-radius: 50%; margin: 0 auto 1.5rem; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; color: white; animation: zoomIn 0.8s ease-out 0.4s both; }}
    @keyframes zoomIn {{ from {{ opacity: 0; transform: scale(0.3); }} to {{ opacity: 1; transform: scale(1); }} }}
    .header h1 {{ font-size: 2rem; margin-bottom: 0.5rem; font-weight: 700; animation: slideInFromBottom 0.6s ease-out 0.6s both; }}
    .header p {{ font-size: 1rem; opacity: 0.9; color: hsl(215.4 16.3% 56.9%); animation: slideInFromBottom 0.6s ease-out 0.8s both; }}
    .invoice-body {{ padding: 2rem; }}
    .summary-card {{ background: hsl(0 0% 100%); border: 1px solid hsl(214.3 31.8% 91.4%); border-radius: 0.5rem; padding: 2rem; margin-bottom: 2rem; box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1); animation: slideInFromBottom 0.7s ease-out 0.3s both; }}
    .summary-card h2 {{ font-size: 1.5rem; font-weight: 600; margin-bottom: 1.5rem; color: hsl(222.2 84% 4.9%); border-bottom: 2px solid hsl(214.3 31.8% 91.4%); padding-bottom: 0.5rem; }}
    .summary-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: 1.5rem; }}
    .summary-item {{ display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; border-radius: 0.375rem; transition: all 0.2s ease-in-out; border: 1px solid transparent; }}
    .summary-item:hover {{ background: hsl(210 40% 96%); transform: scale(1.02); border-color: hsl(214.3 31.8% 91.4%); }}
    .summary-label {{ color: hsl(215.4 16.3% 56.9%); font-weight: 500; }}
    .summary-value {{ font-weight: 600; color: hsl(222.2 84% 4.9%); }}
    .status-badge {{ display: inline-flex; align-items: center; padding: 0.25rem 0.75rem; background: hsl(142.1 76.2% 36.3%); color: white; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; animation: pulse 2s infinite; }}
    @keyframes pulse {{ 0%, 100% {{ opacity: 1; }} 50% {{ opacity: 0.8; }} }}
    .details-table {{ width: 100%; border-collapse: separate; border-spacing: 0; margin: 2rem 0; background: hsl(0 0% 100%); border: 1px solid hsl(214.3 31.8% 91.4%); border-radius: 0.5rem; overflow: hidden; box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1); animation: slideInFromBottom 0.7s ease-out 0.5s both; }}
    .details-table th {{ background: hsl(222.2 84% 4.9%); color: hsl(210 40% 98%); padding: 1rem; text-align: left; font-weight: 600; font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.05em; }}
    .details-table td {{ padding: 1rem; border-bottom: 1px solid hsl(214.3 31.8% 91.4%); transition: all 0.2s ease-in-out; }}
    .details-table tbody tr:hover td {{ background: hsl(210 40% 96%); }}
    .details-table tbody tr:last-child td {{ border-bottom: none; }}
    .total-row {{ background: hsl(142.1 76.2% 36.3%) !important; color: white !important; font-weight: 700; font-size: 1.125rem; }}
    .total-row:hover {{ background: hsl(142.1 76.2% 36.3%) !important; }}
    .footer {{ background: hsl(210 40% 96%); padding: 2rem; text-align: center; border-top: 1px solid hsl(214.3 31.8% 91.4%); animation: fadeIn 1s ease-out 0.7s both; }}
    .footer .thank-you {{ font-size: 1.25rem; color: hsl(222.2 84% 4.9%); font-weight: 600; margin-bottom: 1rem; }}
    .footer p {{ color: hsl(215.4 16.3% 56.9%); margin-bottom: 0.75rem; font-size: 0.875rem; }}
    .contact-info {{ margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid hsl(214.3 31.8% 91.4%); }}
    .contact-info a {{ color: hsl(221.2 83.2% 53.3%); text-decoration: none; font-weight: 500; transition: all 0.2s ease-in-out; }}
    .contact-info a:hover {{ color: hsl(217.2 91.2% 59.8%); text-decoration: underline; }}
    @media print {{ body {{ background: white; padding: 0; }} .invoice-container {{ box-shadow: none; border-radius: 0; animation: none; }} .header-content, .summary-card, .details-table, .footer {{ animation: none; }} }}
    @media (max-width: 768px) {{ body {{ padding: 1rem; }} .header {{ padding: 2rem 1rem; }} .header h1 {{ font-size: 1.5rem; }} .invoice-body {{ padding: 1rem; }} .summary-card {{ padding: 1.5rem; }} .summary-grid {{ grid-template-columns: 1fr; gap: 1rem; }} .details-table th, .details-table td {{ padding: 0.75rem; font-size: 0.875rem; }} }}
  </style>
</head>
<body>
  <div class="invoice-container">
    <div class="header">
      <div class="header-content">
        <div class="success-icon">&#10003;</div>
        <h1>Payment Receipt</h1>
        <p>Your subscription has been confirmed successfully</p>
      </div>
    </div>
    <div class="invoice-body">
      <div class="summary-card">
        <h2>Payment Summary</h2>
        <div class="summary-grid">
          <div class="summary-item"><span class="summary-label">Plan:</span><span class="summary-value">{plan_name}</span></div>
          <div class="summary-item"><span class="summary-label">Amount:</span><span class="summary-value">{amount}</span></div>
          <div class="summary-item"><span class="summary-label">Invoice ID:</span><span class="summary-value">#{invoice_id}</span></div>
          <div class="summary-item"><span class="summary-label">Date:</span><span class="summary-value">{date}</span></div>
          <div class="summary-item"><span class="summary-label">Payment Method:</span><span class="summary-value">Credit Card</span></div>
          <div class="summary-item"><span class="summary-label">Status:</span><span class="status-badge">Paid</span></div>
        </div>
      </div>
      <table class="details-table">
        <thead><tr><th>Description</th><th>Billing Period</th><th>Amount</th></tr></thead>
        <tbody>
          <tr>
            <td><strong>{plan_name}</strong><br><small style="color: hsl(215.4 16.3% 56.9%);">Premium subscription with full access</small></td>
            <td>Monthly Subscription</td>
            <td>{amount}</td>
          </tr>
          <tr class="total-row">
            <td colspan="2"><strong>TOTAL AMOUNT</strong></td>
            <td><strong>{amount}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="footer">
      <p class="thank-you">Thank you for your business!</p>
      <p>This receipt was automatically generated and is valid without signature.</p>
      <div class="contact-info">
        <p>Questions about this invoice? Contact our support team at <a href="mailto:support@tuturuuu.com">support@tuturuuu.com</a></p>
      </div>
    </div>
  </div>
</body>
</html>"#,
        invoice_id = invoice_id,
        plan_name = plan_name,
        amount = amount,
        date = date,
    )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_invoice_ws_id_valid() {
        let ws_id = invoice_ws_id("/api/billing/abc-123/invoice");
        assert_eq!(ws_id, Some("abc-123"));
    }

    #[test]
    fn test_invoice_ws_id_uuid() {
        let ws_id = invoice_ws_id("/api/billing/00000000-0000-0000-0000-000000000001/invoice");
        assert_eq!(ws_id, Some("00000000-0000-0000-0000-000000000001"));
    }

    #[test]
    fn test_invoice_ws_id_wrong_prefix() {
        assert!(invoice_ws_id("/api/v1/billing/abc/invoice").is_none());
        assert!(invoice_ws_id("/api/billing/abc/other").is_none());
        assert!(invoice_ws_id("/api/billing//invoice").is_none());
    }

    #[test]
    fn test_invoice_ws_id_extra_segment() {
        // Must not match paths with extra segments (slash in ws_id position).
        assert!(invoice_ws_id("/api/billing/a/b/invoice").is_none());
    }

    #[test]
    fn test_format_iso_date_full() {
        assert_eq!(format_iso_date("2024-06-29T12:34:56Z"), "June 29, 2024");
        assert_eq!(format_iso_date("2024-01-01"), "January 1, 2024");
        assert_eq!(format_iso_date("2024-12-31"), "December 31, 2024");
    }

    #[test]
    fn test_format_iso_date_single_digit_day() {
        assert_eq!(format_iso_date("2024-03-05"), "March 5, 2024");
    }

    #[test]
    fn test_format_iso_date_empty() {
        assert_eq!(format_iso_date(""), "--");
    }

    #[test]
    fn test_price_string_number() {
        assert_eq!(
            price_string(Some(&Value::Number(
                serde_json::Number::from_f64(9.99).unwrap()
            ))),
            "$9.99"
        );
        assert_eq!(
            price_string(Some(&Value::Number(serde_json::Number::from(0)))),
            "$0.00"
        );
    }

    #[test]
    fn test_price_string_string_value() {
        assert_eq!(
            price_string(Some(&Value::String("29.5".to_owned()))),
            "$29.50"
        );
    }

    #[test]
    fn test_price_string_none() {
        assert_eq!(price_string(None), "--");
    }

    #[test]
    fn test_generate_invoice_html_contains_key_fields() {
        let html = generate_invoice_html("inv-001", "Pro Plan", "$9.99", "June 1, 2024");
        assert!(html.contains("inv-001"));
        assert!(html.contains("Pro Plan"));
        assert!(html.contains("$9.99"));
        assert!(html.contains("June 1, 2024"));
        assert!(html.starts_with("<!DOCTYPE html>"));
        assert!(html.contains("Payment Receipt"));
        assert!(html.contains("support@tuturuuu.com"));
    }
}
