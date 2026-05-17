# Tuturuuu Inventory

Inventory is the satellite app for `inventory.tuturuuu.com`. It owns the
workspace UI for catalog, stock, bundles, checkout fee visibility, Stripe
Connect readiness, and inventory/payment auditing.

Protected APIs should stay centralized in `apps/web` and be consumed through the
satellite `/api/*` fallback rewrite.

```bash
bun dev:inventory
```

For direct port debugging:

```bash
cd apps/inventory
bun dev:app
```
