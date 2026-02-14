const eventData = {
  '@context': 'https://schema.org',
  '@type': 'Event',
  name: 'RMIT NEO League 2026 - Innovation Humanity Challenge',
  description:
    'RMIT NEO League Season 2: A student-led IoT competition by RMIT NEO Culture Technology Club. Engineer integrated IoT solutions addressing UN Sustainable Development Goals.',
  startDate: '2026-03-02',
  endDate: '2026-05-29',
  eventStatus: 'https://schema.org/EventScheduled',
  eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
  organizer: {
    '@type': 'Organization',
    name: 'RMIT NEO Culture Technology Club',
    url: 'https://rmitnct.club',
  },
  location: {
    '@type': 'Place',
    name: 'RMIT University Vietnam - Saigon South Campus',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Ho Chi Minh City',
      addressCountry: 'VN',
    },
  },
  image: '/logo.png',
  isAccessibleForFree: true,
};

const orgData = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'RMIT NEO Culture Technology Club',
  url: 'https://rmitnct.club',
  logo: '/logo.png',
  description:
    'A community fueled by the passion for technology and innovations at RMIT University Vietnam.',
  parentOrganization: {
    '@type': 'EducationalOrganization',
    name: 'RMIT University Vietnam',
    url: 'https://www.rmit.edu.vn',
  },
};

export default function JsonLd() {
  return (
    <>
      <script type="application/ld+json" suppressHydrationWarning>
        {JSON.stringify(eventData)}
      </script>
      <script type="application/ld+json" suppressHydrationWarning>
        {JSON.stringify(orgData)}
      </script>
    </>
  );
}
