import { BASE_URL } from '@/constants/configs';

const eventData = {
  '@context': 'https://schema.org',
  '@type': ['Event', 'Hackathon'],
  name: 'Neo League 2026 - Innovation Humanity Challenge',
  alternateName: [
    'Neo League',
    'Neo League 2026',
    'RMIT NEO League',
    'RMIT IoT Competition 2026',
    'NEO League Season 2',
  ],
  description:
    'RMIT NEO League Season 2 is the premier IoT competition for university students in Vietnam. Hosted by RMIT NEO Culture Technology Club, teams engineer integrated IoT and hardware solutions addressing UN Sustainable Development Goals through prototyping, sensor integration, and smart technologies.',
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
    name: 'RMIT University Vietnam — Saigon South Campus',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Ho Chi Minh City',
      addressRegion: 'Ho Chi Minh',
      addressCountry: 'VN',
    },
  },
  image: `${BASE_URL}/logo.png`,
  url: BASE_URL,
  isAccessibleForFree: true,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'VND',
    availability: 'https://schema.org/InStock',
    url: BASE_URL,
    validFrom: '2026-01-01',
  },
  keywords: [
    'RMIT IoT competition',
    'IoT competition Vietnam',
    'IoT hackathon',
    'hardware competition',
    'RMIT hackathon',
    'student IoT competition',
    'sustainable development goals',
    'RMIT NEO League',
    'IoT prototyping',
    'sensor integration',
    'smart technology',
  ],
  about: [
    {
      '@type': 'Thing',
      name: 'Internet of Things (IoT)',
    },
    {
      '@type': 'Thing',
      name: 'Hardware Development',
    },
    {
      '@type': 'Thing',
      name: 'UN Sustainable Development Goals',
    },
  ],
  audience: {
    '@type': 'EducationalAudience',
    audienceType: 'University Students',
  },
  typicalAgeRange: '18-25',
  inLanguage: ['en', 'vi'],
};

const orgData = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'RMIT NEO Culture Technology Club',
  url: 'https://rmitnct.club',
  logo: `${BASE_URL}/logo.png`,
  description:
    "A community fueled by the passion for technology, IoT, and innovations at RMIT University Vietnam. Organizer of RMIT NEO League \u2014 Vietnam's premier student IoT competition.",
  parentOrganization: {
    '@type': 'EducationalOrganization',
    name: 'RMIT University Vietnam',
    url: 'https://www.rmit.edu.vn',
  },
  sameAs: [
    'https://www.facebook.com/rmit.nct',
    'https://instagram.com/rmitnct',
    'https://linkedin.com/company/rmit-nct',
  ],
};

const websiteData = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Neo League',
  alternateName: ['RMIT NEO League', 'Neo League 2026'],
  url: BASE_URL,
  description:
    "Neo League is Vietnam's premier student IoT competition hosted by RMIT NEO Culture Technology Club. University students engineer integrated hardware and IoT solutions addressing UN Sustainable Development Goals.",
  publisher: {
    '@type': 'Organization',
    name: 'RMIT NEO Culture Technology Club',
    url: 'https://rmitnct.club',
  },
};

const breadcrumbData = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Neo League 2026',
      item: BASE_URL,
    },
  ],
};

export default function JsonLd() {
  return (
    <head>
      <script type="application/ld+json" suppressHydrationWarning>
        {JSON.stringify(eventData)}
      </script>
      <script type="application/ld+json" suppressHydrationWarning>
        {JSON.stringify(orgData)}
      </script>
      <script type="application/ld+json" suppressHydrationWarning>
        {JSON.stringify(websiteData)}
      </script>
      <script type="application/ld+json" suppressHydrationWarning>
        {JSON.stringify(breadcrumbData)}
      </script>
    </head>
  );
}
