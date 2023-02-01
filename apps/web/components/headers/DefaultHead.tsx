import Head from "next/head";

const DefaultHead = () => {
  return (
    <Head>
      <title>Tuturuuu — Productivity at its best, simplified.</title>
      <meta
        name="description"
        content="A simple, easy to use productivity tool for your team. Create tasks, track progress, and get reminders. All in one place."
      />
      <meta
        property="og:image"
        content="https://tuturuuu.com/media/logos/og-image.png"
      />
      <meta
        name="viewport"
        content="width=device-width, initial-scale=1, shrink-to-fit=no"
      />
      <meta name="msapplication-TileColor" content="#000000" />
      <meta name="theme-color" content="#000000" />
      <link
        rel="apple-touch-icon"
        sizes="180x180"
        href="/apple-touch-icon.png"
      />
      <link
        rel="icon"
        type="image/png"
        sizes="32x32"
        href="/favicon-32x32.png"
      />
      <link
        rel="icon"
        type="image/png"
        sizes="16x16"
        href="/favicon-16x16.png"
      />
      <link rel="manifest" href="/site.webmanifest" />
      <link rel="mask-icon" href="/safari-pinned-tab.svg" color="#000000" />
      <link rel="icon" href="/favicon.ico" />
    </Head>
  );
};

export default DefaultHead;
