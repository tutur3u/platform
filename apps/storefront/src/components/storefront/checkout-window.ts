type OpenHostedCheckoutOptions = {
  assign?: (url: string) => void;
};

type SquarePosLaunch = {
  androidUrl: string;
  fallbackUrl: string;
  iosUrl: string;
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

export function openSquarePosCheckout(
  launch: SquarePosLaunch,
  options: OpenHostedCheckoutOptions & { userAgent?: string } = {}
) {
  const assign =
    options.assign ??
    (typeof window === 'undefined'
      ? undefined
      : (url: string) => window.location.assign(url));
  const userAgent =
    options.userAgent ??
    (typeof navigator === 'undefined' ? '' : navigator.userAgent);

  if (/android/iu.test(userAgent)) {
    assign?.(launch.androidUrl);
    return 'android' as const;
  }
  if (/iphone|ipad|ipod/iu.test(userAgent)) {
    assign?.(launch.iosUrl);
    return 'ios' as const;
  }

  assign?.(launch.fallbackUrl);
  return 'unsupported' as const;
}
