import {
  Bot,
  FileCheck,
  Flag,
  Handshake,
  Heart,
  Mail,
  MessageCircle,
  ShieldAlert,
} from '@tuturuuu/icons';
import type { LegalSection } from '@/components/legal/legal-types';

export const communityGuidelinesSections: LegalSection[] = [
  {
    title: 'Purpose & Values',
    icon: Heart,
    color: 'purple',
    content: `These Community Guidelines define the standards of behavior expected from all members of the **Tuturuuu** community — including users, contributors, and collaborators.

Our community is built on the following core values:

* **Respect** — treat everyone with dignity and consideration
* **Collaboration** — work together openly and constructively
* **Transparency** — as an open-source platform, we believe in openness at every level
* **Inclusivity** — welcome people of all backgrounds, identities, and experience levels

These guidelines apply to all interactions within Tuturuuu's platform, including workspaces, comments, AI-generated content, contributions on GitHub, and any other community spaces.`,
  },
  {
    title: 'Respectful Communication',
    icon: MessageCircle,
    color: 'blue',
    content: `We expect all community members to communicate respectfully:

1. **Be Kind and Constructive**
   * Offer feedback that is helpful, specific, and actionable
   * Assume good intent — misunderstandings happen
   * Celebrate the contributions and achievements of others

2. **No Harassment or Discrimination**
   * Harassment, bullying, intimidation, or threats are strictly prohibited
   * Discrimination based on race, ethnicity, gender, sexual orientation, disability, religion, age, or any other protected characteristic is not tolerated
   * Unwelcome sexual attention or advances are prohibited

3. **Healthy Disagreements**
   * Disagreements are natural — focus on ideas, not individuals
   * Avoid personal attacks, name-calling, or inflammatory language
   * If a discussion becomes heated, take a break and return when calm`,
  },
  {
    title: 'Content Standards',
    icon: FileCheck,
    color: 'green',
    content: `All content shared on the platform must meet these standards:

1. **Prohibited Content**
   * Hate speech, slurs, or content promoting violence
   * Sexually explicit or exploitative material
   * Content that promotes self-harm or dangerous activities
   * Spam, scams, phishing attempts, or misleading information
   * Content that infringes on intellectual property rights

2. **Workspace Content**
   * Users are responsible for the content they create in their workspaces
   * Workspace owners are responsible for moderating content within their workspaces
   * Shared or public workspace content must comply with these guidelines

3. **Profile Information**
   * Profile names, avatars, and bios must not contain offensive material
   * Do not impersonate other individuals, organizations, or Tuturuuu staff`,
  },
  {
    title: 'Collaboration Expectations',
    icon: Handshake,
    color: 'orange',
    content: `Tuturuuu is a collaborative platform. We expect users to:

1. **Workspace Etiquette**
   * Respect the rules and norms established by workspace owners and administrators
   * Contribute meaningfully to shared workspaces
   * Do not disrupt or sabotage the work of others
   * Handle shared resources (documents, tasks, calendars) with care

2. **Open-Source Contributions**
   * Follow our [contribution guidelines](https://github.com/tutur3u/platform) when submitting pull requests
   * Be respectful in code reviews — critique the code, not the person
   * Give credit where credit is due
   * Report bugs constructively with clear reproduction steps

3. **Data Responsibility**
   * Do not access or attempt to access other users' private data
   * Respect the privacy settings and permissions within workspaces
   * Handle shared data with appropriate care and confidentiality`,
  },
  {
    title: 'AI Usage Responsibility',
    icon: Bot,
    color: 'cyan',
    content: `Tuturuuu integrates AI features across the platform. When using AI tools, you must:

1. **Honest Representation**
   * Do not present AI-generated content as exclusively human-created when attribution matters
   * Be transparent with your team about AI assistance where relevant
   * Understand that AI outputs may contain errors and should be reviewed

2. **Prohibited AI Uses**
   * Generating harmful, deceptive, or illegal content
   * Attempting to bypass safety filters or content moderation
   * Using AI features to harass, impersonate, or deceive others
   * Creating deepfakes or misleading synthetic media
   * Automated bulk content generation intended to spam or manipulate

3. **Age Restrictions**
   * AI features are restricted to users **18 years of age or older**
   * Do not share AI feature access with minors

For more details, see our [Acceptable Use Policy](/acceptable-use).`,
  },
  {
    title: 'Reporting Violations',
    icon: Flag,
    color: 'indigo',
    content: `If you witness or experience a violation of these guidelines:

1. **How to Report**
   * Email: **community@tuturuuu.com** for general guideline violations
   * Email: **security@tuturuuu.com** for security-related concerns
   * GitHub: Open an issue for open-source community concerns

2. **What to Include**
   * A description of the violation
   * When and where it occurred (workspace, comment, PR, etc.)
   * Any supporting evidence (screenshots, links)
   * Names or identifiers of the individuals involved (if known)

3. **Confidentiality**
   * Reports are handled confidentially — we will not share your identity with the reported party without your consent
   * We take all reports seriously and investigate promptly
   * Retaliation against reporters is strictly prohibited`,
  },
  {
    title: 'Enforcement & Consequences',
    icon: ShieldAlert,
    color: 'red',
    content: `Violations of these Community Guidelines may result in the following actions, depending on severity:

1. **Warning** — a private notice explaining the violation and expected corrective behavior
2. **Content Removal** — removal of offending content from the platform
3. **Temporary Suspension** — temporary restriction of account access
4. **Permanent Ban** — permanent removal from the platform and community

**Enforcement Principles:**
* Responses are proportional to the severity and frequency of violations
* Context is considered — first-time minor violations are typically addressed with a warning
* Repeated violations escalate consequences
* Severe violations (threats, harassment, illegal activity) may result in immediate permanent ban
* Appeals can be submitted to **legal@tuturuuu.com** within 30 days of enforcement action

> We reserve the right to take action on behavior that violates the spirit of these guidelines, even if not explicitly listed.`,
  },
  {
    title: 'Contact Information',
    icon: Mail,
    color: 'teal',
    content: `For questions or concerns about these Community Guidelines:

**Community Team**
Email: community@tuturuuu.com
Response Time: Within 2 business days

**Security Concerns**
Email: security@tuturuuu.com

**Appeals & Legal**
Email: legal@tuturuuu.com

**Open Source**
GitHub: [github.com/tutur3u/platform](https://github.com/tutur3u/platform)

> For urgent safety concerns, please include "URGENT" in the subject line of your email.`,
  },
];
