import {
  Activity,
  Ban,
  BookOpen,
  CircleCheck,
  Code2,
  Copyright,
  Eye,
  Lock,
  Mail,
  ShieldAlert,
  UserCheck,
} from '@tuturuuu/icons';
import type { LegalSection } from '@/components/legal/legal-types';

export const acceptableUseSections: LegalSection[] = [
  {
    title: 'Purpose & Scope',
    icon: BookOpen,
    color: 'purple',
    content: `This Acceptable Use Policy ("AUP") defines the permitted and prohibited uses of **Tuturuuu's** platform, services, and infrastructure.

This policy applies to:

* All registered users and workspace members
* API consumers and integration developers
* Open-source contributors interacting with our hosted services
* Any individual or entity accessing our Services

This AUP supplements our [Terms of Service](/terms) and [Community Guidelines](/community-guidelines). Violations of this policy may result in enforcement actions as described in those documents.`,
  },
  {
    title: 'Permitted Uses',
    icon: CircleCheck,
    color: 'blue',
    content: `Tuturuuu is designed for legitimate productivity and collaboration. Permitted uses include:

* **Workspace Management** — creating and managing teams, projects, and tasks
* **Document Collaboration** — creating, editing, and sharing documents within workspaces
* **Calendar & Scheduling** — managing events, meetings, and availability
* **Finance Tracking** — recording transactions, budgets, and financial data for legitimate purposes
* **AI-Assisted Productivity** — using AI features for content generation, summarization, and automation
* **URL Shortening** — creating short links for legitimate business or personal use
* **Open-Source Development** — contributing to, forking, or building upon the Tuturuuu codebase
* **API Integration** — building integrations using our APIs in accordance with documentation and rate limits`,
  },
  {
    title: 'Prohibited Activities',
    icon: Ban,
    color: 'red',
    content: `The following activities are strictly prohibited:

1. **Illegal Activities**
   * Using the Services for any unlawful purpose or to promote illegal activities
   * Money laundering, fraud, or financial crimes
   * Distribution of illegal content or materials

2. **Abuse & Harassment**
   * Harassment, stalking, threats, or intimidation of any individual
   * Doxing — publishing private information about others without consent
   * Coordinated inauthentic behavior or manipulation campaigns

3. **Malicious Technical Activities**
   * Distributing malware, viruses, or other harmful software
   * Attempting unauthorized access to accounts, systems, or data
   * Conducting denial-of-service attacks or network disruption
   * Exploiting vulnerabilities without responsible disclosure (see [Terms of Service](/terms))

4. **Deceptive Practices**
   * Phishing, social engineering, or impersonation
   * Creating fake accounts or artificially inflating metrics
   * Spreading misinformation or disinformation at scale

5. **Content Violations**
   * Child sexual abuse material (CSAM) — immediately reported to authorities
   * Terrorism-related content or promotion of extremist ideologies
   * Non-consensual intimate imagery`,
  },
  {
    title: 'Account Usage Rules',
    icon: UserCheck,
    color: 'green',
    content: `To maintain a secure and fair platform:

1. **Account Integrity**
   * Each individual should maintain only one primary account
   * Do not create accounts for the purpose of circumventing bans or restrictions
   * Business accounts should be clearly identified and managed by authorized personnel

2. **Authentication & Access**
   * Keep your credentials secure — do not share passwords or session tokens
   * Enable additional security measures (e.g., multi-factor authentication) when available
   * Immediately report compromised accounts to **security@tuturuuu.com**

3. **Workspace Governance**
   * Workspace owners are responsible for managing member access and permissions
   * Remove inactive or unauthorized members promptly
   * Respect the access levels assigned to your role within a workspace`,
  },
  {
    title: 'API & Automation Guidelines',
    icon: Code2,
    color: 'indigo',
    content: `When accessing Tuturuuu through APIs or automated tools:

1. **Rate Limits**
   * Respect all published rate limits (default: 100 requests/minute)
   * Do not attempt to circumvent or bypass rate limiting mechanisms
   * Contact us for higher limits if your legitimate use case requires them

2. **Authentication**
   * Use API keys only for their intended purpose
   * Do not share, publish, or expose API keys in public repositories
   * Rotate keys regularly and revoke compromised keys immediately

3. **Automation Standards**
   * Automated actions must comply with all platform policies
   * Bots and integrations must identify themselves accurately
   * Do not use automation to scrape data, spam, or manipulate platform features

4. **Data Handling**
   * API consumers must handle user data in accordance with our [Privacy Policy](/privacy)
   * Do not store more data than necessary for your integration's purpose
   * Implement appropriate security measures for any data accessed through APIs`,
  },
  {
    title: 'Resource Usage & Fair Use',
    icon: Activity,
    color: 'amber',
    content: `To ensure reliable service for all users:

1. **Compute & Storage**
   * Do not consume excessive compute, bandwidth, or storage resources
   * Large file uploads should be within documented size limits
   * Use storage efficiently — do not use the platform as a general-purpose file hosting service

2. **AI Feature Usage**
   * AI features are subject to usage quotas based on your subscription plan
   * Do not attempt to extract, replicate, or reverse-engineer AI model weights or training data
   * Automated bulk requests to AI endpoints must respect rate limits

3. **Fair Use Principle**
   * Usage should be consistent with the intended purpose of each feature
   * Patterns of usage that degrade service quality for others may be throttled
   * We reserve the right to set and adjust usage limits to maintain platform stability`,
  },
  {
    title: 'Security Requirements',
    icon: Lock,
    color: 'cyan',
    content: `All users share responsibility for platform security:

1. **Credential Management**
   * Use strong, unique passwords for your Tuturuuu account
   * Never share credentials via insecure channels (chat, email, etc.)
   * Report suspected credential compromise immediately

2. **Vulnerability Handling**
   * If you discover a security vulnerability, report it privately to **security@tuturuuu.com**
   * Do not publicly disclose vulnerabilities before they are addressed
   * Do not exploit vulnerabilities to access data beyond what is necessary to demonstrate the issue

3. **Data Protection**
   * Do not attempt to access, modify, or delete data belonging to other users
   * Respect encryption and access controls
   * Handle any personal data you encounter in accordance with applicable privacy laws`,
  },
  {
    title: 'Intellectual Property',
    icon: Copyright,
    color: 'orange',
    content: `Respect intellectual property rights on the platform:

1. **Your Content**
   * You retain ownership of content you create through the Services
   * Ensure you have the right to share any content you upload or distribute
   * Grant appropriate licenses when contributing to open-source repositories

2. **Others' Content**
   * Do not copy, distribute, or use others' content without permission
   * Respect copyright, trademarks, and other intellectual property rights
   * Attribute sources when sharing or building upon others' work

3. **Tuturuuu Brand**
   * Tuturuuu's logos, trademarks, and brand assets are proprietary
   * Do not use Tuturuuu branding in ways that imply endorsement without written permission
   * Open-source use of the codebase does not grant trademark rights`,
  },
  {
    title: 'Compliance & Monitoring',
    icon: Eye,
    color: 'emerald',
    content: `We take a balanced approach to policy enforcement:

1. **Monitoring Practices**
   * We use automated systems to detect policy violations (spam, malware, abuse patterns)
   * We do not proactively read or monitor the content of private workspaces
   * We may investigate specific accounts when we receive reports or detect automated abuse signals

2. **Transparency**
   * Our platform is open-source — security and moderation mechanisms are publicly auditable
   * We publish transparency reports on policy enforcement actions
   * Users will be notified of any enforcement action taken on their account

3. **Legal Compliance**
   * We comply with applicable Vietnamese law and international regulations
   * We cooperate with law enforcement when legally required
   * We may preserve account data when required by law or for ongoing investigations`,
  },
  {
    title: 'Enforcement & Consequences',
    icon: ShieldAlert,
    color: 'violet',
    content: `Violations of this Acceptable Use Policy may result in:

1. **Graduated Response**
   * **Notice** — notification of the violation with guidance on remediation
   * **Feature Restriction** — temporary limitation of specific features (e.g., AI access, API usage)
   * **Account Suspension** — temporary suspension of account access
   * **Account Termination** — permanent removal from the platform

2. **Immediate Action**
   * Severe violations (illegal content, active attacks, CSAM) result in immediate account termination and may be reported to law enforcement
   * Accounts involved in ongoing security threats may be suspended without prior notice

3. **Appeals**
   * You may appeal enforcement decisions by contacting **legal@tuturuuu.com** within 30 days
   * Appeals are reviewed by a member of the team not involved in the original decision
   * We aim to respond to appeals within 10 business days`,
  },
  {
    title: 'Contact Information',
    icon: Mail,
    color: 'teal',
    content: `For questions about this Acceptable Use Policy:

**Policy Questions**
Email: legal@tuturuuu.com
Response Time: Within 2 business days

**Abuse Reports**
Email: abuse@tuturuuu.com

**Security Concerns**
Email: security@tuturuuu.com

**Open Source**
GitHub: [github.com/tutur3u/platform](https://github.com/tutur3u/platform)

> For urgent abuse or security concerns, please include "URGENT" in the subject line.`,
  },
];
