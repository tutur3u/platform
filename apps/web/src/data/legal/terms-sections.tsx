import {
  BookOpen,
  Code2,
  Copyright,
  CreditCard,
  Database,
  Globe,
  Info,
  Mail,
  Scale,
  Settings,
  Shield,
  Users,
  UserX,
} from '@tuturuuu/icons';
import type { LegalSection } from '@/components/legal/legal-types';
import { ThirdPartyServicesSection } from '@/components/legal/third-party-services-section';
import { thirdPartyCategories } from './third-party-providers';

export const termsSections: LegalSection[] = [
  {
    title: 'Introduction',
    icon: BookOpen,
    color: 'purple',
    content: `These Terms of Service ("Terms") govern your access to and use of services provided by **Tuturuuu JSC** (Công ty Cổ phần Tuturuuu, Tax ID: 0318898402), a company incorporated in Vietnam on April 2, 2025 ("Tuturuuu," "we," "our," or "us").

By accessing or using our website, applications, and other software or services (collectively, the "Services"), you signify your acceptance of these Terms. If you do not agree to these Terms, you must not access or use the Services.`,
  },
  {
    title: 'Service Description',
    icon: Info,
    color: 'blue',
    content: `Tuturuuu provides an **AI-powered productivity platform** designed to enhance team collaboration and efficiency. Our Services include:

* **Workspace management** — team collaboration, user groups, and permissions
* **Calendar** — scheduling, event management, and third-party calendar sync
* **Finance** — transaction tracking, budgets, and multi-currency support
* **Tasks** — hierarchical task management with boards, lists, and projects
* **URL Shortener** — branded short links with analytics
* **AI features** — chat, content generation, and automation tools

Our platform is **fully open-source** on GitHub. Anyone can view, audit, and contribute to the source code.`,
  },
  {
    title: 'User Obligations',
    icon: Users,
    color: 'green',
    content: `Users of the Services must comply with the following requirements:

1. **Age Requirement:**
   * Users must be at least 13 years of age to access basic services
   * Users must be at least **18 years of age** to access AI features
   * Parental/guardian consent is required for users aged 13–18 for non-AI features

2. **Account Security:**
   * Maintain the confidentiality of your account credentials
   * Promptly notify us of any unauthorized access or security breaches
   * Do not share account access with unauthorized users

3. **Accurate Information:**
   * Provide and maintain accurate, current, and complete account information
   * Update your information promptly if it changes

4. **Compliance:**
   * Adhere to all applicable laws, regulations, and these Terms
   * Follow our [Community Guidelines](/community-guidelines) and [Acceptable Use Policy](/acceptable-use)

5. **Prohibited Activities:**
   * Unauthorized access, interference with Services, or malicious activities
   * Circumventing age restrictions, particularly for AI features
   * Using the Services for spam, harassment, or illegal purposes`,
  },
  {
    title: 'Intellectual Property & Open Source',
    icon: Copyright,
    color: 'orange',
    content: `**Open-Source Code:**
Our source code is publicly available on GitHub under an open-source license. The community can freely view, fork, contribute to, and audit the codebase. Contributions are reviewed by our internal team before being merged.

**Proprietary Assets:**
Brand assets, logos, trademarks, and trade names of Tuturuuu remain proprietary. These may not be used without prior written permission.

**User Content:**
You retain ownership of content you create through our Services. By uploading content, you grant us a limited license to process and display it as necessary to provide the Services.`,
  },
  {
    title: 'Data Processing & Privacy',
    icon: Database,
    color: 'cyan',
    content: `The collection, processing, and storage of user data are governed by our [Privacy Policy](/privacy), which is incorporated by reference into these Terms.

**Key commitment: We do NOT sell your data to third parties.**

By using the Services, you acknowledge and consent to our data practices as described in the Privacy Policy. We implement appropriate technical and organizational measures to protect your data, and our open-source nature means security practices are publicly auditable.`,
  },
  {
    title: 'Third-Party Services',
    icon: Globe,
    color: 'indigo',
    content: (
      <ThirdPartyServicesSection
        categories={thirdPartyCategories}
        alertTitle="Third-Party Data Sharing"
        alertDescription="We carefully select our service providers and share only the minimum data necessary for each service to function. Each provider listed below has their own terms and privacy policy."
      />
    ),
  },
  {
    title: 'Payment Terms',
    icon: CreditCard,
    color: 'emerald',
    content: `**All payments are processed by Polar.sh.** Tuturuuu does not directly store or handle payment card information.

* **Free tier** is available with core features at no cost
* Paid plans are billed according to the selected subscription period
* Payment card information is collected and stored exclusively by Polar.sh
* Refund policies follow Polar.sh's standard terms
* You can manage your subscription through your account settings

> By subscribing to a paid plan, you agree to Polar.sh's terms of service for payment processing.`,
  },
  {
    title: 'Open Source & Community',
    icon: Code2,
    color: 'pink',
    content: `Tuturuuu is built in the open. Our entire platform source code is available on [GitHub](https://github.com/tutur3u/platform).

**Contributing:**
* Community contributions are welcome via pull requests
* All contributions are reviewed by our internal team before merging
* Contributors must follow our contribution guidelines

**Responsible Disclosure:**
* If you discover a security vulnerability, please report it privately to **security@tuturuuu.com**
* Do not publicly disclose vulnerabilities before they are addressed
* We acknowledge and credit responsible disclosures

**Bug Reports:**
* For non-security bugs, please open an issue on our GitHub repository`,
  },
  {
    title: 'Modifications to Services',
    icon: Settings,
    color: 'amber',
    content: `We reserve the right to modify, suspend, or discontinue any aspect of the Services at any time. This includes:

1. **Feature Management** — adding or removing features or functionality
2. **Technical Updates** — implementing necessary technical adjustments and security measures
3. **Service Levels** — adjusting availability or performance targets

We will make reasonable efforts to provide advance notice of significant changes that may affect your use of the Services.`,
  },
  {
    title: 'Account Termination',
    icon: UserX,
    color: 'red',
    content: `We reserve the right to suspend or terminate user accounts for:

1. **Policy Violations** — violation of these Terms, fraudulent or illegal activities
2. **Non-Payment** — failure to pay applicable fees after reasonable notice
3. **Harmful Activity** — any activity deemed harmful to the Services or other users

**Data Export:** Before account termination takes effect, we will make reasonable efforts to provide you with the opportunity to export your data.

> Account termination may result in the deletion of associated data and content after a reasonable retention period.`,
  },
  {
    title: 'Limitation of Liability',
    icon: Shield,
    color: 'slate',
    content: `To the maximum extent permitted by law, Tuturuuu JSC shall not be liable for:

1. **Financial Impact** — direct, indirect, incidental, special, consequential, or exemplary damages; loss of profits, revenue, data, or business opportunities
2. **Service Issues** — service interruptions, data loss, or claims related to third-party services
3. **General Limitations** — any damages arising from use or inability to use the Services

> The Services are provided **"as is"** without warranties of any kind, either express or implied.`,
  },
  {
    title: 'Governing Law',
    icon: Scale,
    color: 'violet',
    content: `These Terms shall be governed by and construed in accordance with the laws of **Vietnam**.

**Tuturuuu JSC** (Công ty Cổ phần Tuturuuu, Tax ID: 0318898402) is incorporated and operates under Vietnamese law. Any disputes arising from or in connection with these Terms shall be subject to the exclusive jurisdiction of the courts of Vietnam.

For international users, the applicable provisions of your local consumer protection laws may also apply where mandatory.`,
  },
  {
    title: 'Contact Information',
    icon: Mail,
    color: 'teal',
    content: `For inquiries regarding these Terms or our Services:

**Legal Department**
Email: legal@tuturuuu.com
Response Time: Within 2 business days

**Security Concerns**
Email: security@tuturuuu.com

**Bug Reports & Feature Requests**
GitHub: [github.com/tutur3u/platform/issues](https://github.com/tutur3u/platform/issues)

> For urgent matters, please include "URGENT" in the subject line of your email.`,
  },
];
