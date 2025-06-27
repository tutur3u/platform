"use client";

import { Button } from "@tuturuuu/ui/button";
import { ArrowUpCircle, CheckCircle } from "lucide-react";
import { useState } from "react";
import { createClient } from "@tuturuuu/supabase/next/client";
import PurchaseLink from "./data-polar-checkout";
import { useTranslations } from "next-intl";
// Define types for the props we're passing from the server component
interface Plan {
  name: string;
  price: string;
  billingCycle: string;
  startDate?: string;
  nextBillingDate?: string;
  status?: string;
  features?: string[];
}

interface BillingClientProps {
  currentPlan: Plan;
  wsId: string;
  products: any[];
  product_id: string;
  isCreator: boolean;
  isAdmin?: boolean;
  activeSubscriptionId?: string;
}

const syncToProduct = async (products: any[]) => {
  const supabase = createClient();

  const insertedProducts = await Promise.all(
    products.map(async (product) => {
      const { data, error } = await supabase
        .from("workspace_subscription_products")
        .insert({
          id: product.id,
          name: product.name,
          price: Number(product.price),
          recurring_interval: product.recurringInterval,
          description: product.description || "",
        })
        .select();

      if (error) {
        console.error("Error inserting product:", error);
        return null;
      }
      return data;
    }),
  );

  return insertedProducts;
};
export function BillingClient({
  currentPlan,
  isAdmin = false,
  products,
  wsId,
  isCreator,
}: BillingClientProps) {
  const [showUpgradeOptions, setShowUpgradeOptions] = useState(false);
  const [_isLoading, _setIsLoading] = useState(false);
  const [message, _setMessage] = useState("");
  const [syncCompleted, setSyncCompleted] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const t = useTranslations("billing");
  // const handleCancelSubscription = async () => {
  //   setIsLoading(true);
  //   setMessage('');

  //   const response = await fetch(`/api/${wsId}/${product_id}/cancel`, {
  //     method: 'POST',
  //     headers: {
  //       'Content-Type': 'application/json',
  //     },

  //     body: JSON.stringify({ polarSubscriptionId: activeSubscriptionId }),
  //   });

  //   setIsLoading(false);

  //   if (response.ok) {
  //     setMessage(
  //       'Your subscription will be canceled at the end of your billing period.'
  //     );
  //     // Reload the page to show the updated subscription status
  //     window.location.reload();
  //   } else {
  //     const errorData = await response.json();
  //     setMessage(
  //       `Error: ${errorData.error || 'Could not cancel subscription.'}`
  //     );
  //   }
  // };
  const upgradePlans = products.map((product, index) => ({
    id: product.id,
    name: product.name,
    price:
      product.prices && product.prices.length > 0
        ? product.prices[0] && "priceAmount" in product.prices[0]
          ? `$${((product.prices[0] as any).priceAmount / 100).toFixed(2)}`
          : "Free"
        : "Custom",
    billingCycle:
      product.prices && product.prices.length > 0
        ? product.prices[0]?.type === "recurring"
          ? product.prices[0]?.recurringInterval || "month"
          : "one-time"
        : "month",
    popular: index === 1,
    features: product.description
      ? [product.description, "Customer support", "Access to platform features"]
      : [
          "Standard features",
          "Customer support",
          "Access to platform features",
        ],
    isEnterprise: product.name.toLowerCase().includes("enterprise"),
  }));

  const handleSyncToProduct = async () => {
    setSyncLoading(true);
    setSyncCompleted(false);
    try {
      await syncToProduct(products);
      setSyncCompleted(true);
    } catch (error) {
      console.error("Sync failed:", error);
    } finally {
      setSyncLoading(false);
    }
  };

  return (
    <>
      <h1 className="mb-2 text-3xl font-bold tracking-tight">{t("billing")}</h1>
      <p className="mb-8 text-muted-foreground">{t("billing-info")}</p>

      {/* Current Plan Card */}
      <div className="mb-8 rounded-lg border border-border bg-card p-8 shadow-sm dark:bg-card/80">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-card-foreground">
              {t("current-plan")}
            </h2>
            <p className="text-muted-foreground">{t("current-plan-details")}</p>
          </div>
          <div className="flex items-center">
            <span
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                currentPlan.status === "active"
                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
              }`}
            >
              {currentPlan.status === "active" ? "Active" : "Pending"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8">
          <div>
            <div className="mb-6">
              <h3 className="mb-1 text-xl font-bold text-card-foreground">
                {currentPlan.name}
              </h3>
              <p className="text-2xl font-bold text-primary">
                {currentPlan.price}
                <span className="text-sm text-muted-foreground">
                  /{currentPlan.billingCycle}
                </span>
              </p>
            </div>

            <div className="mb-6 grid grid-cols-2 gap-6 md:grid-cols-4">
              <div>
                <p className="text-sm text-muted-foreground">
                  {t("start-date")}
                </p>
                <p className="font-medium text-card-foreground">
                  {currentPlan.startDate}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  {t("next-billing")}
                </p>
                <p className="font-medium text-card-foreground">
                  {currentPlan.nextBillingDate}
                </p>
              </div>
            </div>

            <div className="mb-8">
              <h4 className="mb-4 font-medium text-card-foreground">
                Plan Features:
              </h4>
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {currentPlan.features?.map((feature, index) => (
                  <li
                    key={index}
                    className="flex items-center text-card-foreground"
                  >
                    <CheckCircle className="mr-3 h-5 w-5 flex-shrink-0 text-primary" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            {message && (
              <div
                className={`mb-4 rounded-lg p-3 text-sm ${
                  message.includes("Error")
                    ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                    : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                }`}
              >
                {message}
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <Button
                disabled={!isCreator}
                onClick={() => setShowUpgradeOptions(!showUpgradeOptions)}
                className="flex items-center"
                size="lg"
              >
                <ArrowUpCircle className="mr-2 h-5 w-5" />
                {showUpgradeOptions ? t("hide-upgrade") : t("upgrade-plan")}
              </Button>
              {/* <Button
                variant="outline"
                size="lg"
                className="border-border"
                onClick={handleCancelSubscription}
                disabled={isLoading || !activeSubscriptionId}
              >
                {isLoading ? 'Cancelling...' : 'Cancel Subscription'}
              </Button> */}
            </div>
          </div>
        </div>
      </div>

      {/* Upgrade Options */}
      {showUpgradeOptions && (
        <div className="mb-8 rounded-lg border-2 border-primary/20 bg-card p-8 shadow-sm dark:bg-card/80">
          <h2 className="mb-6 text-2xl font-semibold text-card-foreground">
            {t("upgrade-plan")}
          </h2>
          {isAdmin && (
            <div className="mb-6 flex items-center gap-3">
              {!syncCompleted ? (
                <Button
                  onClick={handleSyncToProduct}
                  disabled={syncLoading}
                  className="flex items-center"
                >
                  {syncLoading ? "Syncing..." : "Sync to product to database"}
                </Button>
              ) : (
                <Button
                  disabled
                  className="flex items-center bg-green-600 hover:bg-green-600"
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Sync Completed
                </Button>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {upgradePlans.map((plan) => (
              <div
                key={plan.id}
                className={`rounded-lg border transition-shadow hover:shadow-md ${
                  plan.popular ? "relative border-primary" : "border-border"
                }`}
              >
                {plan.popular && (
                  <div className="absolute top-0 right-0 rounded-tr-md rounded-bl-lg bg-primary px-3 py-1 text-xs text-primary-foreground">
                    {t("recommend")}
                  </div>
                )}
                <div className="p-6">
                  <h3 className="mb-1 text-xl font-bold text-card-foreground">
                    {plan.name}
                  </h3>
                  <p className="mb-4 text-2xl font-bold text-primary">
                    {plan.price}
                    <span className="text-sm text-muted-foreground">
                      /{plan.billingCycle}
                    </span>
                  </p>
                  <ul className="mb-6">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="mb-2 flex items-start">
                        <CheckCircle className="mt-0.5 mr-2 h-5 w-5 flex-shrink-0 text-primary" />
                        <span className="text-card-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  {plan.isEnterprise ? (
                    <Button className="w-full" variant="outline" disabled>
                      {t("contact-sales")}
                    </Button>
                  ) : (
                    <Button
                      variant={plan.popular ? "default" : "outline"}
                      className={`w-full ${
                        plan.popular
                          ? ""
                          : "border-primary bg-transparent text-primary hover:bg-primary/10"
                      }`}
                      asChild
                    >
                      <PurchaseLink
                        productId={plan.id}
                        wsId={wsId}
                        customerEmail="t@test.com"
                        theme="auto"
                        className="flex w-full items-center justify-center"
                      >
                        Select {plan.name}
                      </PurchaseLink>
                    </Button>
                  )}
                  {plan.isEnterprise && (
                    <p className="mt-2 text-center text-xs text-muted-foreground">
                      {t("contact-sales-desc")}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-muted-foreground">{t("plan-desc")}</p>
        </div>
      )}
    </>
  );
}
