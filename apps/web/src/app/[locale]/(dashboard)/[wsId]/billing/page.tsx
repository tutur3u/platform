import { createClient } from "@tuturuuu/supabase/next/server";
import { ROOT_WORKSPACE_ID } from "@tuturuuu/utils/constants";
import { createPolarClient } from "@/lib/polar";
import { BillingClient } from "./billing-client";
import BillingHistory from "./billing-history";
import { checkTuturuuuAdmin } from "@tuturuuu/utils/workspace-helper";
const fetchProducts = async ({
  wsId,
  sandbox,
}: {
  wsId: string;
  sandbox: boolean;
}) => {
  try {
    const polarClient = createPolarClient({
      sandbox:
        // Always use sandbox for development
        process.env.NODE_ENV === "development"
          ? true
          : // If the workspace is the root workspace and the sandbox is true, use sandbox
            wsId === ROOT_WORKSPACE_ID && sandbox
            ? true // Enable sandbox for root workspace
            : false, // Otherwise, use production
    });

    const res = await polarClient.products.list({ isArchived: false });

    return res.result.items ?? [];
  } catch (err) {
    console.error("Failed to fetch products:", err);
    return [];
  }
};

const checkCreator = async (wsId: string) => {
  const supabase = await createClient();

  if (wsId !== ROOT_WORKSPACE_ID) {
    console.error("Billing page is only available for root workspace");
    return false;
  }

  const { data, error } = await supabase.rpc("check_ws_creator", {
    ws_id: wsId,
  });

  if (error) {
    console.error("Error checking workspace creator:", error);
    return true;
  }

  return data;
};

const fetchSubscription = async ({
  wsId,
  sandbox,
}: {
  wsId: string;
  sandbox: boolean;
}) => {
  const sbAdmin = await createClient();

  const { data: dbSub, error } = await sbAdmin
    .from("workspace_subscription")
    .select("*")
    .eq("ws_id", wsId)
    .eq("status", "active")
    .single();

  if (error || !dbSub) {
    console.error("Error fetching subscription:", error);
    return null;
  }

  const polarClient = createPolarClient({
    sandbox:
      // Always use sandbox for development
      process.env.NODE_ENV === "development"
        ? true
        : // If the workspace is the root workspace and the sandbox is true, use sandbox
          wsId === ROOT_WORKSPACE_ID && sandbox
          ? true // Enable sandbox for root workspace
          : false, // Otherwise, use production
  });

  const polarProduct = await polarClient.products.get({
    id: dbSub.product_id || "",
  });

  if (!polarProduct) return null;

  return {
    status: dbSub.status,
    currentPeriodStart: dbSub.current_period_start,
    currentPeriodEnd: dbSub.current_period_end,
    polar_subscription_id: dbSub.polar_subscription_id,
    product: {
      id: polarProduct.id,
      name: polarProduct.name,
      description: polarProduct.description,
      price: polarProduct.prices[0] || null,
    },
  };
};

const fetchWorkspaceSubscriptions = async (wsId: string) => {
  const sbAdmin = await createClient();

  const { data, error } = await sbAdmin
    .from("workspace_subscription")
    .select(
      `
      id,
      created_at,
      product_id,
      status,
      cancel_at_period_end,
      workspace_subscription_products (
        name,
        description,
        price,
        recurring_interval
      )
    `,
    )
    .eq("ws_id", wsId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("Error fetching billing history:", error);
    return [];
  }

  return data ?? [];
};

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ wsId: string }>;
  searchParams: Promise<{ sandbox: string }>;
}) {
  const { wsId } = await params;
  const { sandbox } = await searchParams;

  
  const enableSandbox = sandbox === "true";
  const isTuturuuuAdmin = await checkTuturuuuAdmin();
  const [products, subscription, isCreator, subscriptionHistory] =
    await Promise.all([
      fetchProducts({ wsId, sandbox: enableSandbox }),
      fetchSubscription({ wsId, sandbox: enableSandbox }),
      checkCreator(wsId),
      fetchWorkspaceSubscriptions(wsId),
    ]);

  const currentPlan = subscription?.product
    ? {
        name: subscription.product.name || "No Plan",
        price:
          subscription.product.price &&
          "priceAmount" in subscription.product.price
            ? `$${(subscription.product.price.priceAmount / 100).toFixed(2)}`
            : "Free",
        billingCycle:
          subscription.product.price?.type === "recurring"
            ? subscription.product.price?.recurringInterval || "month"
            : "one-time",
        startDate: subscription.currentPeriodStart
          ? new Date(subscription.currentPeriodStart).toLocaleDateString()
          : "-",
        nextBillingDate: subscription.currentPeriodEnd
          ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
          : "-",
        status: subscription.status || "inactive",
        features: [
          subscription.product.description || "Standard features",
          "Customer support",
          "Access to platform features",
        ],
      }
    : {
        name: "Free Plan",
        price: "$0",
        billingCycle: "month",
        startDate: "-",
        nextBillingDate: "-",
        status: "active",
        features: ["Basic features", "Limited usage", "Community support"],
      };

  const billingHistory = subscriptionHistory.map((sub, index) => ({
    id: sub.id ?? `SUB-${sub.product_id?.slice(-6) || index}`,
    created_at: sub.created_at,
    product_id: sub.product_id,
    status: sub.status ?? "unknown",
    cancel_at_period_end: sub.cancel_at_period_end,
    product: sub.workspace_subscription_products
      ? {
          name: sub.workspace_subscription_products.name || "Unknown Plan",
          description: sub.workspace_subscription_products.description,
          price: sub.workspace_subscription_products.price || 0,
          recurring_interval:
            sub.workspace_subscription_products.recurring_interval || "month",
        }
      : null,
  }));

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      
      <BillingClient
        currentPlan={currentPlan}
        isAdmin={isTuturuuuAdmin}
        products={products}
        product_id={subscription?.product.id || ""}
        wsId={wsId}
        activeSubscriptionId={subscription?.polar_subscription_id || ""}
        isCreator={isCreator}
      />

      <BillingHistory billingHistory={billingHistory} />
    </div>
  );
}
