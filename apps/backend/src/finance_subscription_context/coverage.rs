use super::{LatestInvoiceContext, LatestInvoiceRow};
use std::collections::BTreeSet;

pub(super) fn latest_invoice_context(mut rows: Vec<LatestInvoiceRow>) -> Vec<LatestInvoiceContext> {
    let exact = rows
        .iter()
        .filter_map(|row| {
            let invoice = row.finance_invoices.as_ref()?;
            invoice.completed_at.as_ref()?;
            let months = invoice.subscription_months.as_ref()?;
            Some(LatestInvoiceContext {
                group_id: row.user_group_id.clone()?,
                valid_until: invoice.valid_until.clone(),
                created_at: invoice.created_at.clone().unwrap_or_default(),
                covered_months: Some(months.clone()),
            })
        })
        .collect::<Vec<_>>();
    rows.retain(|row| {
        row.finance_invoices
            .as_ref()
            .and_then(|invoice| {
                invoice.completed_at.as_deref()?;
                if invoice.subscription_months.is_some() {
                    return None;
                }
                comparable_timestamp_key(invoice.valid_until.as_deref())
            })
            .is_some()
    });
    rows.sort_by(|a, b| {
        let a_invoice = a.finance_invoices.as_ref();
        let b_invoice = b.finance_invoices.as_ref();
        let a_valid_until =
            comparable_timestamp_key(a_invoice.and_then(|invoice| invoice.valid_until.as_deref()));
        let b_valid_until =
            comparable_timestamp_key(b_invoice.and_then(|invoice| invoice.valid_until.as_deref()));
        let a_created_at =
            comparable_timestamp_key(a_invoice.and_then(|invoice| invoice.created_at.as_deref()));
        let b_created_at =
            comparable_timestamp_key(b_invoice.and_then(|invoice| invoice.created_at.as_deref()));

        b_valid_until
            .cmp(&a_valid_until)
            .then_with(|| b_created_at.cmp(&a_created_at))
    });

    let mut seen_group_ids = BTreeSet::new();
    let mut latest_invoices = Vec::new();

    for row in rows {
        let Some(group_id) = row.user_group_id.filter(|group_id| !group_id.is_empty()) else {
            continue;
        };

        if !seen_group_ids.insert(group_id.clone()) {
            continue;
        }

        let Some(invoice) = row.finance_invoices else {
            continue;
        };

        latest_invoices.push(LatestInvoiceContext {
            group_id,
            valid_until: invoice.valid_until,
            created_at: invoice.created_at.unwrap_or_default(),
            covered_months: None,
        });
    }

    latest_invoices.extend(exact);
    latest_invoices
}

fn comparable_timestamp_key(value: Option<&str>) -> Option<(i32, u32, u32, u32, u32, u32)> {
    let value = value?.trim();
    let (date, time) = value.split_once('T').unwrap_or((value, ""));
    let mut date_parts = date.split('-');
    let year = date_parts.next()?.parse::<i32>().ok()?;
    let month = date_parts.next()?.parse::<u32>().ok()?;
    let day = date_parts.next()?.parse::<u32>().ok()?;

    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }

    let mut time_parts = time.split([':', '.', '+', '-', 'Z']);
    let hour = time_parts
        .next()
        .and_then(|part| part.parse::<u32>().ok())
        .unwrap_or(0);
    let minute = time_parts
        .next()
        .and_then(|part| part.parse::<u32>().ok())
        .unwrap_or(0);
    let second = time_parts
        .next()
        .and_then(|part| part.parse::<u32>().ok())
        .unwrap_or(0);

    Some((year, month, day, hour, minute, second))
}
