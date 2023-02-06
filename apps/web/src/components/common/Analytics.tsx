import { GoogleAnalytics } from 'nextjs-google-analytics';
import { Analytics as VercelAnalytics } from '@vercel/analytics/react';

const Analytics = () => {
  return (
    <>
      <GoogleAnalytics trackPageViews />
      <VercelAnalytics />
    </>
  );
};

export default Analytics;
