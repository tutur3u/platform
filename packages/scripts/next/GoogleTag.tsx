import Script from 'next/script';

const GoogleTag = ({ id }: { id: string }) => {
  const htmlEmbed = `
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', ${id}, {
      page_path: window.location.pathname,
  });`;

  return (
    <>
      <Script
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${id}`}
      />
      <Script
        id="google-analytics"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: htmlEmbed,
        }}
      />
    </>
  );
};

export default GoogleTag;
