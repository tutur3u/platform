type OpenHostedCheckoutOptions = {
  assign?: (url: string) => void;
};

export function openHostedPolarCheckout(
  checkoutUrl: string,
  options: OpenHostedCheckoutOptions = {}
) {
  const assign =
    options.assign ??
    (typeof window === 'undefined'
      ? undefined
      : (url: string) => window.location.assign(url));

  // A single same-tab navigation is intentional. Browsers can return `null`
  // from `window.open(..., 'noopener')` even after opening the destination;
  // treating that as a blocked popup and falling back to location.assign()
  // opens Polar twice. Same-tab checkout also preserves the browser's Back
  // behavior and avoids popup blockers after the async session request.
  assign?.(checkoutUrl);
  return 'same-tab' as const;
}
