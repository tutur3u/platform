type HostedCheckoutWindow = Pick<Window, 'focus'>;

type OpenHostedCheckoutOptions = {
  assign?: (url: string) => void;
  open?: (
    url: string,
    target: string,
    features: string
  ) => HostedCheckoutWindow | null;
};

export const HOSTED_POLAR_CHECKOUT_TARGET = '_blank';
export const HOSTED_POLAR_CHECKOUT_FEATURES = 'noopener,noreferrer';

export function openHostedPolarCheckout(
  checkoutUrl: string,
  options: OpenHostedCheckoutOptions = {}
) {
  const open =
    options.open ??
    (typeof window === 'undefined'
      ? undefined
      : (url: string, target: string, features: string) =>
          window.open(url, target, features));
  const assign =
    options.assign ??
    (typeof window === 'undefined'
      ? undefined
      : (url: string) => window.location.assign(url));

  let checkoutWindow: HostedCheckoutWindow | null = null;

  try {
    checkoutWindow =
      open?.(
        checkoutUrl,
        HOSTED_POLAR_CHECKOUT_TARGET,
        HOSTED_POLAR_CHECKOUT_FEATURES
      ) ?? null;
  } catch {
    checkoutWindow = null;
  }

  if (checkoutWindow) {
    try {
      checkoutWindow.focus();
    } catch {
      // Focus can fail in constrained browsers; the checkout tab is already open.
    }

    return 'new-tab' as const;
  }

  assign?.(checkoutUrl);
  return 'same-tab' as const;
}
