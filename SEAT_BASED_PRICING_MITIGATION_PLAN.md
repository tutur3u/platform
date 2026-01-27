# Seat-Based Pricing Migration Plan

## Executive Summary

Migrate from **fixed workspace pricing** to **seat-based pricing** where each plan's price applies per workspace member per month/year. The migration leverages Polar's native seat-based pricing features.

---

## Phase 1: Database Schema Changes

### 1.1 New Migration: Track Pricing Model on Subscriptions

**File**: `apps/db/supabase/migrations/YYYYMMDDHHMMSS_add_seat_based_pricing.sql`

```sql
-- Add pricing_model enum to track legacy vs seat-based subscriptions
CREATE TYPE workspace_pricing_model AS ENUM ('fixed', 'seat_based');

-- Add columns to workspace_subscriptions
ALTER TABLE workspace_subscriptions
ADD COLUMN pricing_model workspace_pricing_model DEFAULT 'fixed',
ADD COLUMN seat_count integer,
ADD COLUMN price_per_seat real;

-- Add columns to workspace_subscription_products  
ALTER TABLE workspace_subscription_products
ADD COLUMN pricing_model workspace_pricing_model DEFAULT 'fixed',
ADD COLUMN price_per_seat real,
ADD COLUMN min_seats integer DEFAULT 1,
ADD COLUMN is_seat_based boolean DEFAULT false;
```

### 1.2 Create Seat Tracking Table

```sql
-- Track individual seats within a workspace subscription
CREATE TABLE workspace_subscription_seats (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    ws_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    subscription_id uuid NOT NULL REFERENCES workspace_subscriptions(id) ON DELETE CASCADE,
    user_id uuid REFERENCES users(id),
    
    -- Polar seat reference
    polar_seat_id text,
    
    -- Seat status: pending (invited), claimed (active), revoked
    status text NOT NULL DEFAULT 'pending',
    
    -- Invitation tracking
    invitation_email text,
    invitation_token text,
    invitation_expires_at timestamptz,
    claimed_at timestamptz,
    
    UNIQUE(subscription_id, user_id)
);

-- Index for efficient queries
CREATE INDEX idx_ws_subscription_seats_ws_id ON workspace_subscription_seats(ws_id);
CREATE INDEX idx_ws_subscription_seats_subscription ON workspace_subscription_seats(subscription_id);
CREATE INDEX idx_ws_subscription_seats_user ON workspace_subscription_seats(user_id) WHERE user_id IS NOT NULL;
```

### 1.3 Update Types

After running migrations, regenerate types with `bun sb:typegen` and add to `packages/types/src/db.ts`:

```typescript
export type WorkspacePricingModel = Database['public']['Enums']['workspace_pricing_model'];
export type WorkspaceSubscriptionSeat = Tables<'workspace_subscription_seats'>;
```

---

## Phase 2: Polar Dashboard Configuration

### 2.1 Request Seat-Based Pricing Feature Flag

Contact Polar support to enable the **seat-based pricing feature** on your organization (currently in private beta per documentation).

### 2.2 Create New Seat-Based Products in Polar

For each existing tier (Plus, Pro, Enterprise), create new seat-based products:

| Existing Product | New Seat-Based Product |
|-----------------|----------------------|
| Tuturuuu Workspace Plus Monthly ($9/mo) | Tuturuuu Workspace Plus Monthly (Seat) - $9/seat/mo |
| Tuturuuu Workspace Plus Yearly ($90/yr) | Tuturuuu Workspace Plus Yearly (Seat) - $90/seat/yr |
| Tuturuuu Workspace Pro Monthly ($29/mo) | Tuturuuu Workspace Pro Monthly (Seat) - $29/seat/mo |
| Tuturuuu Workspace Pro Yearly ($290/yr) | Tuturuuu Workspace Pro Yearly (Seat) - $290/seat/yr |

**Product Metadata Configuration:**

```json
{
  "product_tier": "PLUS",
  "pricing_model": "seat_based"
}
```

### 2.3 Configure Tiered Pricing (Optional Volume Discounts)

If you want volume discounts:

- 1-4 seats: Full price per seat
- 5-9 seats: 10% discount per seat
- 10+ seats: 20% discount per seat

---

## Phase 3: Backend Implementation

### 3.1 Update Webhook Handler

**File**: `apps/web/src/app/api/payment/webhooks/route.ts`

Add seat tracking webhook handlers:

```typescript
// Add new handlers
onCustomerSeatAssigned: async (payload) => {
  const sbAdmin = await createAdminClient();
  const seatData = payload.data;
  
  // Map Polar seat to our database
  await sbAdmin.from('workspace_subscription_seats').upsert({
    polar_seat_id: seatData.id,
    ws_id: seatData.metadata?.wsId,
    subscription_id: seatData.subscription_id, // need to resolve
    user_id: seatData.customer?.externalId,
    status: 'pending',
    invitation_email: seatData.email,
  }, { onConflict: 'polar_seat_id' });
},

onCustomerSeatClaimed: async (payload) => {
  const sbAdmin = await createAdminClient();
  const seatData = payload.data;
  
  await sbAdmin.from('workspace_subscription_seats')
    .update({ 
      status: 'claimed', 
      claimed_at: new Date().toISOString(),
      user_id: seatData.customer?.externalId 
    })
    .eq('polar_seat_id', seatData.id);
},

onCustomerSeatRevoked: async (payload) => {
  const sbAdmin = await createAdminClient();
  await sbAdmin.from('workspace_subscription_seats')
    .update({ status: 'revoked' })
    .eq('polar_seat_id', payload.data.id);
},
```

### 3.2 Create Seat Management API Routes

**File**: `apps/web/src/app/api/payment/seats/route.ts`

```typescript
// GET: List seats for a workspace subscription
export async function GET(req: Request) {
  const { wsId, subscriptionId } = await getParams(req);
  const supabase = await createClient();
  
  // Verify permission
  const hasPermission = await checkPermission(supabase, wsId, 'manage_subscription');
  if (!hasPermission) return unauthorized();
  
  const { data: seats } = await supabase
    .from('workspace_subscription_seats')
    .select('*, users(display_name, avatar_url)')
    .eq('subscription_id', subscriptionId);
    
  return Response.json({ seats });
}

// POST: Add a seat (invite member)
export async function POST(req: Request) {
  const { wsId, subscriptionId, email, userId } = await req.json();
  
  const polar = createPolarClient();
  
  // Create seat in Polar
  const seat = await polar.customerSeats.assign({
    subscriptionId,
    email,
    externalCustomerId: userId,
    metadata: { wsId }
  });
  
  // Polar will trigger webhook to sync to our DB
  return Response.json({ success: true, seatId: seat.id });
}

// DELETE: Revoke a seat
export async function DELETE(req: Request) {
  const { seatId } = await getParams(req);
  
  const polar = createPolarClient();
  await polar.customerSeats.revoke({ seatId });
  
  return Response.json({ success: true });
}
```

### 3.3 Auto-Sync Seats with Workspace Members

**File**: `apps/web/src/app/api/v1/workspaces/members/route.ts`

Update member addition to automatically create/sync seats:

```typescript
export async function POST(req: Request) {
  // ... existing member addition logic
  
  // After adding member, sync seat with Polar
  const subscription = await getActiveSubscription(wsId);
  
  if (subscription?.pricing_model === 'seat_based') {
    // Create seat in Polar (will prorate billing)
    await polar.customerSeats.assign({
      subscriptionId: subscription.polar_subscription_id,
      externalCustomerId: newMember.userId,
      email: newMember.email,
      metadata: { wsId }
    });
  }
}

export async function DELETE(req: Request) {
  // ... existing member removal logic
  
  // After removing member, revoke seat
  const seat = await getSeatByUserId(wsId, removedUserId);
  if (seat?.polar_seat_id) {
    await polar.customerSeats.revoke({ seatId: seat.polar_seat_id });
  }
}
```

### 3.4 Update Checkout Flow

**File**: `apps/web/src/app/[locale]/(dashboard)/[wsId]/billing/purchase-link.tsx`

Modify to include seat count during checkout:

```typescript
const createCheckoutSession = async () => {
  // Get current member count for initial seat quantity
  const memberCount = await getWorkspaceMemberCount(wsId);
  
  const response = await fetch(`/api/payment/subscriptions/${subscriptionId}/checkouts`, {
    method: 'POST',
    body: JSON.stringify({
      productId,
      wsId,
      seatCount: Math.max(1, memberCount), // Minimum 1 seat
    }),
  });
  
  // ... redirect to checkout
};
```

---

## Phase 4: Frontend Updates

### 4.1 Update Billing Page

**File**: `apps/web/src/app/[locale]/(dashboard)/[wsId]/billing/page.tsx`

Add seat count display:

```typescript
// Fetch member count for seat-based subscriptions
const memberCount = await supabase
  .from('workspace_members')
  .select('*', { count: 'exact', head: true })
  .eq('ws_id', wsId);

// Pass to BillingClient
<BillingClient
  currentPlan={currentPlan}
  seatCount={memberCount.count}
  isSeatBased={subscription?.pricing_model === 'seat_based'}
  // ...
/>
```

### 4.2 Update BillingClient

**File**: `apps/web/src/app/[locale]/(dashboard)/[wsId]/billing/billing-client.tsx`

Add seat-based pricing display:

```tsx
{/* Pricing - Updated for seat-based */}
<div className="flex items-baseline gap-1">
  <span className="font-black text-4xl">
    ${centToDollar(currentPlan.price)}
  </span>
  {isSeatBased ? (
    <span className="text-lg text-muted-foreground">
      /{t('per-seat-per')}{currentPlan.billingCycle === 'month' ? t('per-month') : t('per-year')}
    </span>
  ) : (
    <span className="text-lg text-muted-foreground">
      {currentPlan.billingCycle === 'month' ? t('per-month') : t('per-year')}
    </span>
  )}
</div>

{/* Seat count display */}
{isSeatBased && (
  <div className="mt-4 rounded-lg bg-muted/50 p-4">
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{t('current-seats')}</span>
      <span className="font-semibold">{seatCount} {t('seats')}</span>
    </div>
    <div className="flex items-center justify-between mt-2">
      <span className="text-muted-foreground">{t('total-monthly-cost')}</span>
      <span className="font-bold text-xl">
        ${centToDollar(currentPlan.price * seatCount)}/{currentPlan.billingCycle}
      </span>
    </div>
  </div>
)}
```

### 4.3 Update Plan List Dialog

**File**: `apps/web/src/app/[locale]/(dashboard)/[wsId]/billing/plan-list.tsx`

Update price display to show per-seat pricing:

```tsx
{/* Pricing */}
<div className="flex items-baseline gap-1">
  <span className={cn('font-black text-2xl', styles.iconColor)}>
    ${centToDollar(plan.price)}
  </span>
  {plan.isSeatBased ? (
    <span className="text-muted-foreground text-sm">
      /seat/{plan.billingCycle === 'month' ? t('mo') : t('yr')}
    </span>
  ) : (
    <span className="text-muted-foreground text-sm">
      {plan.billingCycle === 'month' ? t('per-month') : t('per-year')}
    </span>
  )}
</div>

{/* Estimated cost based on current members */}
{plan.isSeatBased && memberCount > 0 && (
  <p className="mt-1 text-muted-foreground text-xs">
    ~${centToDollar(plan.price * memberCount)}/{plan.billingCycle} for {memberCount} member{memberCount > 1 ? 's' : ''}
  </p>
)}
```

### 4.4 Add Translations

**Files**: `apps/web/messages/en.json` and `apps/web/messages/vi.json`

```json
{
  "billing": {
    "per-seat-per": "/seat/",
    "current-seats": "Current seats",
    "seats": "seats",
    "total-monthly-cost": "Total monthly cost",
    "seat-based-note": "Price is per workspace member per billing cycle",
    "add-seat": "Add seat",
    "remove-seat": "Remove seat",
    "manage-seats": "Manage seats"
  }
}
```

---

## Phase 5: Sync Logic & Edge Cases

### 5.1 Handle Member Count Changes

Create a background job or trigger to sync seats when members change:

**File**: `apps/web/src/app/api/cron/payment/sync-seats/route.ts`

```typescript
export async function GET(req: Request) {
  const sbAdmin = await createAdminClient();
  
  // Find seat-based subscriptions
  const { data: subscriptions } = await sbAdmin
    .from('workspace_subscriptions')
    .select('*, workspaces!inner(id)')
    .eq('pricing_model', 'seat_based')
    .eq('status', 'active');
    
  for (const sub of subscriptions ?? []) {
    // Get actual member count
    const { count: memberCount } = await sbAdmin
      .from('workspace_members')
      .select('*', { count: 'exact', head: true })
      .eq('ws_id', sub.ws_id);
      
    // Get current seat count from Polar
    const polar = createPolarClient();
    const polarSub = await polar.subscriptions.get({ id: sub.polar_subscription_id });
    
    // If mismatch, update Polar
    if (memberCount !== polarSub.seatCount) {
      await polar.subscriptions.update({
        id: sub.polar_subscription_id,
        seatCount: Math.max(1, memberCount ?? 0) // Minimum 1 seat
      });
    }
  }
  
  return Response.json({ success: true });
}
```

### 5.2 Grandfather Existing Subscriptions

Existing subscriptions remain on `pricing_model = 'fixed'` by default. They continue working as-is until:

1. User manually upgrades to seat-based plan
2. Subscription expires and user renews with new plan

---

## Phase 6: Testing Checklist

### 6.1 Unit Tests

```typescript
// packages/payment/src/__tests__/seat-pricing.test.ts
describe('Seat-based pricing', () => {
  it('calculates correct total for seat count', () => {
    const pricePerSeat = 900; // $9.00 in cents
    const seatCount = 5;
    expect(calculateTotal(pricePerSeat, seatCount)).toBe(4500);
  });
  
  it('enforces minimum 1 seat', () => {
    expect(normalizeSeatCount(0)).toBe(1);
    expect(normalizeSeatCount(-1)).toBe(1);
  });
  
  it('syncs seat count with member count', async () => {
    // Test sync logic
  });
});
```

### 6.2 Integration Tests

- [ ] Create new workspace -> Verify 1 seat subscription created
- [ ] Add member -> Verify seat added and prorated charge
- [ ] Remove member -> Verify seat revoked
- [ ] Upgrade plan -> Verify seat count preserved
- [ ] Downgrade plan -> Verify seat count preserved
- [ ] Cancel subscription -> Verify all seats revoked

---

## Phase 7: Rollout Strategy

### Week 1-2: Preparation

- [ ] Request Polar seat-based feature flag
- [ ] Create new seat-based products in Polar Sandbox
- [ ] Run database migrations on staging
- [ ] Implement backend changes

### Week 3: Testing

- [ ] Full integration testing on staging
- [ ] Load testing with simulated seat changes
- [ ] UX testing with team members

### Week 4: Soft Launch

- [ ] Deploy to production with feature flag
- [ ] Enable for new workspaces only
- [ ] Monitor for issues

### Week 5+: Full Launch

- [ ] Enable for all new purchases
- [ ] Send migration notifications to existing users
- [ ] Allow existing users to opt-in to seat-based

---

## Summary of Files to Modify

| Category | File Path | Changes |
|----------|-----------|---------|
| **Database** | `apps/db/supabase/migrations/YYYYMMDDHHMMSS_*.sql` | New tables, enums, columns |
| **Types** | `packages/types/src/db.ts` | New type exports |
| **Webhooks** | `apps/web/src/app/api/payment/webhooks/route.ts` | Add seat event handlers |
| **API** | `apps/web/src/app/api/payment/seats/route.ts` | New seat management endpoint |
| **API** | `apps/web/src/app/api/v1/workspaces/members/route.ts` | Add seat sync logic |
| **UI** | `apps/web/src/app/[locale]/(dashboard)/[wsId]/billing/page.tsx` | Add seat count |
| **UI** | `apps/web/src/app/[locale]/(dashboard)/[wsId]/billing/billing-client.tsx` | Seat-based display |
| **UI** | `apps/web/src/app/[locale]/(dashboard)/[wsId]/billing/plan-list.tsx` | Per-seat pricing |
| **Translations** | `apps/web/messages/en.json`, `vi.json` | New billing strings |
| **Cron** | `apps/web/src/app/api/cron/payment/sync-seats/route.ts` | New seat sync job |
