/**
 * JSON-LD for the landing page.
 *
 * `SoftwareApplication` is the schema search engines use to render an app
 * result — name, category, price. Emitted as a plain script tag because
 * `next/script` defers execution, and structured data has to be in the HTML the
 * crawler receives, not injected after hydration.
 */
export function LandingStructuredData({
  description,
  name,
  url,
}: {
  description: string;
  name: string;
  url: string;
}) {
  const payload = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    applicationCategory: 'BusinessApplication',
    description,
    name,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    operatingSystem: 'Web',
    publisher: {
      '@type': 'Organization',
      name: 'Tuturuuu',
      url: 'https://tuturuuu.com',
    },
    url,
  };

  return (
    <script
      // eslint-disable-next-line react/no-danger -- JSON-LD serialization encodes < to prevent a closing-script terminator.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(payload).replace(/</g, '\\u003c'),
      }}
      type="application/ld+json"
    />
  );
}
