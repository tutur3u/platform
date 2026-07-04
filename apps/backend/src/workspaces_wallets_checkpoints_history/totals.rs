use super::*;

// ---------------------------------------------------------------------------
// Totals (summarizeCheckpointTotals)
// ---------------------------------------------------------------------------

pub(super) fn summarize_checkpoint_totals(checkpoints: &[NormalizedCheckpoint]) -> Vec<Value> {
    struct Total {
        actual_total: f64,
        checkpoint_count: i64,
        ledger_total: f64,
        variance_total: f64,
    }

    // BTreeMap keeps currencies sorted (mirrors localeCompare sort).
    let mut totals: BTreeMap<String, Total> = BTreeMap::new();
    for checkpoint in checkpoints {
        let entry = totals.entry(checkpoint.currency.clone()).or_insert(Total {
            actual_total: 0.0,
            checkpoint_count: 0,
            ledger_total: 0.0,
            variance_total: 0.0,
        });
        entry.actual_total += checkpoint.actual_balance;
        entry.ledger_total += checkpoint.current_ledger_balance;
        entry.variance_total += checkpoint.current_variance;
        entry.checkpoint_count += 1;
    }

    totals
        .into_iter()
        .map(|(currency, total)| {
            json!({
                "actual_total": total.actual_total,
                "checkpoint_count": total.checkpoint_count,
                "currency": currency,
                "ledger_total": total.ledger_total,
                "variance_total": total.variance_total,
            })
        })
        .collect()
}
