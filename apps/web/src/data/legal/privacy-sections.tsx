import {
  Baby,
  Clock,
  Code2,
  Cookie,
  CreditCard,
  FileText,
  Globe,
  Lock,
  Mail,
  RefreshCcw,
  Share2,
  Shield,
  UserCog,
  Users,
} from '@tuturuuu/icons';
import type { LegalSection } from '@/components/legal/legal-types';
import { ThirdPartyServicesSection } from '@/components/legal/third-party-services-section';
import { thirdPartyCategories } from './third-party-providers';

export const privacySections: LegalSection[] = [
  {
    title: 'Overview',
    icon: Shield,
    color: 'purple',
    content: `This Privacy Policy ("Policy") describes how **Tuturuuu JSC** (Công ty Cổ phần Tuturuuu, Tax ID: 0318898402), a company incorporated in Vietnam, collects, uses, and protects your personal information.

This Policy applies to all users of our services, including our website, applications, and related services (collectively, the "Services").

As an **open-source platform**, our data handling practices are publicly auditable through our GitHub repository.

**Important:** Artificial intelligence (AI) features are only available to users **18 years of age or older**.`,
  },
  {
    title: 'Information Collection',
    icon: FileText,
    color: 'blue',
    content: `We collect the following categories of information:

1. **Required Information**
   * Email address (mandatory for authentication and platform access)

2. **Optional Information**
   * Name and contact details (provided at user discretion)
   * Gender and birthday (when voluntarily provided)

3. **Usage Information**
   * Device and browser information
   * IP address and approximate location
   * Service usage patterns and performance metrics

4. **User-Generated Content**
   * Documents, files, and workspace data
   * Communications and feedback`,
  },
  {
    title: 'How We Use Your Information',
    icon: Users,
    color: 'green',
    content: `We process your information for the following purposes:

1. **Service Provision**
   * Account management and authentication
   * Service delivery and customization
   * Technical support and maintenance

2. **Service Improvement**
   * Analytics via **Vercel Analytics** (privacy-friendly, no personal data tracking)
   * Performance optimization and product development

3. **Communication**
   * Service updates and important notifications
   * Support responses
   * Marketing communications (with your explicit consent only)`,
  },
  {
    title: 'Third-Party Services & Data Sharing',
    icon: Share2,
    color: 'indigo',
    content: (
      <ThirdPartyServicesSection
        categories={thirdPartyCategories}
        alertTitle="We Do NOT Sell Your Data"
        alertDescription="We do NOT sell your personal information to any third party. We share data with service providers only to the extent necessary for operating our platform. We may also disclose information when required by law, court order, or to protect our rights and safety."
      />
    ),
  },
  {
    title: 'Security Measures',
    icon: Lock,
    color: 'emerald',
    content: `We implement comprehensive security measures to protect your information:

1. **Technical Controls**
   * Industry-standard encryption protocols
   * Secure data transmission (SSL/TLS)
   * Access control and authentication systems
   * Regular security assessments and penetration testing

2. **Organizational Controls**
   * Data access policies and least-privilege principles
   * Incident response procedures

3. **Open-Source Advantage**
   * Our codebase is publicly auditable — the community can review security implementations
   * Report security concerns to **security@tuturuuu.com**

> We continuously monitor and update our security measures to protect against emerging threats.`,
  },
  {
    title: 'Data Retention',
    icon: Clock,
    color: 'amber',
    content: `We retain your personal data according to the following principles:

1. **Active Accounts** — data is retained for as long as your account is active and needed to provide Services
2. **Account Deletion** — upon account removal, personal data is deleted within 30 days, except where retention is legally required
3. **Legal Requirements** — certain data may be retained longer to comply with legal obligations, resolve disputes, or enforce agreements
4. **Anonymized Data** — aggregated, anonymized data may be retained indefinitely for analytics and service improvement

> You can request data deletion at any time by contacting us or through your account settings.`,
  },
  {
    title: 'User Rights',
    icon: UserCog,
    color: 'cyan',
    content: `You have the following rights regarding your personal information:

1. **Access** — review the personal information we hold about you
2. **Correction** — update or correct inaccurate information
3. **Deletion** — request deletion of your account and associated data
4. **Export** — receive a copy of your data in a portable format
5. **Withdraw Consent** — opt out of non-essential data processing
6. **Lodge Complaints** — contact relevant data protection authorities

**How to exercise your rights:**
Contact our Data Protection team at **privacy@tuturuuu.com** or use the data management tools in your account settings.

For more information about how we expect data to be handled on our platform, see our [Community Guidelines](/community-guidelines) and [Acceptable Use Policy](/acceptable-use).`,
  },
  {
    title: 'Cookie Policy',
    icon: Cookie,
    color: 'orange',
    content: `We use the following types of cookies:

1. **Essential Cookies**
   * Authentication and session management
   * Security and fraud prevention
   * User preferences and settings

2. **Analytics Cookies**
   * **Vercel Analytics** — privacy-friendly usage analytics
   * Performance monitoring and optimization

3. **Security Cookies**
   * **Cloudflare Turnstile** — bot detection and verification

**Note:** We do not currently use marketing or advertising cookies. You can manage cookie preferences through your browser settings.`,
  },
  {
    title: 'Minor Protection',
    icon: Baby,
    color: 'pink',
    content: `Our commitment to protecting minors includes:

1. **Age Restrictions**
   * General services require users to be at least **13 years old**
   * AI features are **strictly limited to users 18 years and older**
   * Parental consent is required for users aged 13–18 for non-AI features

2. **Data Protection**
   * Immediate deletion of data if we identify it belongs to a minor under 13
   * Enhanced privacy controls for users aged 13–18
   * Age verification measures during registration

> If you believe we have inadvertently collected information from a child under 13, or if a minor under 18 has accessed AI features, please contact us immediately at **privacy@tuturuuu.com**.`,
  },
  {
    title: 'International Data Transfer',
    icon: Globe,
    color: 'violet',
    content: `**Tuturuuu JSC** is based in Vietnam. Your data may be transferred to and processed in other jurisdictions through our service providers:

* **Hosting** — Vercel (global edge network)
* **Database** — Supabase (cloud infrastructure)
* **AI Processing** — various providers as listed in the Third-Party Services section

We ensure appropriate safeguards are in place for all international data transfers, including contractual protections with our service providers.`,
  },
  {
    title: 'Payment Processing',
    icon: CreditCard,
    color: 'emerald',
    content: `Payment information is handled as follows:

1. **Collection** — payment information is only collected when you subscribe to a paid plan
2. **Processing** — all payment credentials are processed and stored exclusively by **Polar.sh**
3. **Data Minimization** — Tuturuuu does not directly store payment card information in our systems
4. **History** — payment history is retained for legal compliance and dispute resolution

> No payment information is required for free accounts.`,
  },
  {
    title: 'Open Source Transparency',
    icon: Code2,
    color: 'teal',
    content: `As a fully open-source platform, we offer an additional layer of transparency:

* **Source Code** — our entire codebase is available at [github.com/tutur3u/platform](https://github.com/tutur3u/platform)
* **Security Auditing** — the community can review how we handle data at the code level
* **Responsible Disclosure** — report security vulnerabilities privately to **security@tuturuuu.com**
* **Contribution Reviews** — all code contributions are reviewed by our internal team before being merged to ensure security and privacy standards are maintained`,
  },
  {
    title: 'Policy Updates',
    icon: RefreshCcw,
    color: 'slate',
    content: `This Privacy Policy may be updated periodically:

1. **Notification** — changes will be announced on our website
2. **Version Control** — previous versions are tracked with effective dates
3. **Acceptance** — continued use of the Services after changes constitutes acceptance

> Material changes will be highlighted and take effect after a reasonable notice period.`,
  },
  {
    title: 'Contact Information',
    icon: Mail,
    color: 'rose',
    content: `For privacy-related inquiries:

**Data Protection Team**
Email: privacy@tuturuuu.com
Response Time: Within 48 hours

**Security Concerns**
Email: security@tuturuuu.com

**Bug Reports & Feature Requests**
GitHub: [github.com/tutur3u/platform/issues](https://github.com/tutur3u/platform/issues)

> For immediate assistance with privacy concerns, please include "PRIVACY" in the subject line.`,
  },
];
