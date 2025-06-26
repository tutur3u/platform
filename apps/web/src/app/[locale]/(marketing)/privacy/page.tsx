'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import {
  AlertCircle,
  Baby,
  Check,
  ChevronRight,
  Clock,
  Cookie,
  FileText,
  Globe,
  Lock,
  Mail,
  RefreshCcw,
  Share2,
  Shield,
  UserCog,
  Users,
} from '@tuturuuu/ui/icons';
import { MemoizedReactMarkdown } from '@tuturuuu/ui/markdown';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Separator } from '@tuturuuu/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export default function PrivacyPage() {
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const sections = [
    {
      title: 'Overview',
      icon: <Shield className="h-6 w-6" />,
      content: `This Privacy Policy ("Policy") describes how Tuturuuu ("we," "our," or "us") collects, uses, and protects your personal information. 

This Policy applies to all users of our services, including our website, applications, and related services (collectively, the "Services"). 

**By using our Services, you consent to the data practices described in this Policy.**

**Important Age Restriction Notice:** Artificial intelligence (AI) features are only available to users 18+ in age. If you are under this age limit, access to AI services and features will not be available.`,
    },
    {
      title: 'Information Collection',
      icon: <FileText className="h-6 w-6" />,
      content: `We collect the following categories of information:

1. **Required Information**
   * Email address (mandatory for authentication and platform access)

2. **Optional Information**
   * Name and contact details (provided at user discretion)
   * Gender and birthday (when voluntarily provided by user)
   * Professional and employment information (when voluntarily provided by user)
   * Payment information (required only for paid plans, processed by Stripe)

3. **Usage Information**
   * Device and browser information
   * IP address and location data
   * Service usage patterns
   * Performance metrics

4. **User-Generated Content**
   * Documents and files
   * Communications
   * Feedback and preferences`,
    },
    {
      title: 'Data Processing',
      icon: <Users className="h-6 w-6" />,
      content: `We process your information for the following purposes:

1. **Service Provision**
   * Account management and authentication
   * Service delivery and customization
   * Technical support and maintenance

2. **Service Improvement**
   * Analytics and performance optimization
   * Product development and enhancement
   * Quality assurance

3. **Communication**
   * Service updates and notifications
   * Marketing communications (with consent)
   * Support responses`,
    },
    {
      title: 'Security Measures',
      icon: <Lock className="h-6 w-6" />,
      content: `We implement comprehensive security measures to protect your information:

1. **Technical Controls**
   * Industry-standard encryption protocols
   * Secure data transmission (SSL/TLS)
   * Regular security assessments
   * Access control and authentication

2. **Organizational Controls**
   * Employee training and awareness
   * Data access policies
   * Incident response procedures
   * Regular security audits

> We continuously monitor and update our security measures to protect against emerging threats.`,
    },
    {
      title: 'Data Sharing',
      icon: <Share2 className="h-6 w-6" />,
      content: `We may share your information with:

1. **Service Providers**
   * Stripe (payment processing for paid plans)
   * Cloud infrastructure providers
   * Analytics services
   * Customer support platforms

2. **Legal Requirements**
   * Court orders and legal processes
   * Regulatory compliance
   * Law enforcement requests
   * Protection of rights and safety

> **Important:** We do not sell your personal information to third parties.`,
    },
    {
      title: 'User Rights',
      icon: <UserCog className="h-6 w-6" />,
      content: `You have the following rights regarding your personal information:

1. **Access Rights**
   * Review collected information
   * Request data copies
   * Verify processing activities

2. **Control Rights**
   * Update or correct information
   * Delete account and data
   * Opt-out of communications
   * Export data

3. **Additional Rights**
   * Withdraw consent
   * Lodge complaints
   * Object to processing

To exercise any of these rights, please contact our [Data Protection Officer](#contact-information).`,
    },
    {
      title: 'Cookie Policy',
      icon: <Cookie className="h-6 w-6" />,
      content: `Our cookie usage includes:

1. **Essential Cookies**
   * Authentication and security
   * Service functionality
   * User preferences

2. **Analytics Cookies**
   * Usage patterns
   * Performance monitoring
   * Service optimization

3. **Marketing Cookies (Optional)**
   * Personalized content
   * Marketing effectiveness
   * User engagement

> Users can modify cookie preferences through browser settings.`,
    },
    {
      title: 'Minor Protection',
      icon: <Baby className="h-6 w-6" />,
      content: `Our commitment to protecting minors includes:

1. **Age Restrictions**
   * General services are not intended for users under 13
   * Artificial intelligence (AI) features are strictly limited to users 18 years and older
   * Parental consent required for users 13-18 for non-AI features
   * Age verification measures are implemented during registration

2. **Data Protection**
   * Immediate deletion of identified minor data
   * Restricted processing of minor information
   * Enhanced privacy controls

3. **Reporting Mechanisms**
   * Dedicated channels for concerns
   * Prompt investigation procedures
   * Parental involvement protocols

> If you believe we have inadvertently collected information from a minor, or if you are under 18 and have gained access to AI features, please contact us immediately.`,
    },
    {
      title: 'International Transfer',
      icon: <Globe className="h-6 w-6" />,
      content: `For international data transfers:

1. **Compliance Measures**
   * EU-US Privacy Shield compliance
   * Standard contractual clauses
   * Data transfer agreements

2. **Security Standards**
   * Global data protection standards
   * Regional compliance requirements
   * Cross-border transfer safeguards

3. **User Rights**
   * International data access
   * Regional privacy rights
   * Transfer transparency

> We ensure appropriate safeguards are in place for all international data transfers.`,
    },
    {
      title: 'Payment Processing',
      icon: <Lock className="h-6 w-6" />,
      content: `Payment information is handled as follows:

1. **Collection Circumstances**
   * Payment information is only collected when a user starts a non-trial paid plan
   * No payment information is required for free or trial accounts
   * Users are clearly notified when payment information is required

2. **Third-Party Processing**
   * All payment credentials are processed and stored by Stripe, our payment processor
   * We do not directly store payment card information in our systems
   * Stripe employs industry-standard security practices for payment data protection

3. **Data Minimization**
   * Only payment information necessary for transaction processing is collected
   * Payment history is retained for legal compliance purposes
   * Access to payment data is strictly limited

> We maintain PCI DSS compliance through our partnership with Stripe for all payment processing operations.`,
    },
    {
      title: 'Policy Updates',
      icon: <RefreshCcw className="h-6 w-6" />,
      content: `This Privacy Policy may be updated periodically:

1. **Notification Process**
   * Website announcements (currently our only notification method)
   * No automated email or in-app notifications at this time

2. **Version Control**
   * Change documentation
   * Previous version archive
   * Effective date tracking

3. **User Actions**
   * Review of changes recommended
   * Continued use constitutes acceptance of updated terms
   * Opt-out options when applicable

> Changes become effective immediately after posting unless otherwise specified.`,
    },
    {
      title: 'Contact Information',
      icon: <Mail className="h-6 w-6" />,
      content: `For privacy-related inquiries:

**Data Protection Officer**  
Email: privacy@tuturuuu.com  
Response Time: 48 hours

> For immediate assistance with privacy concerns, please use the urgent contact channels.`,
    },
  ];

  const tableOfContents = sections.map((section, index) => ({
    id: section.title.toLowerCase().replace(/\s+/g, '-'),
    title: section.title,
    number: index + 1,
  }));

  // Track active section for better navigation
  const handleScroll = () => {
    const sectionElements = sections.map((section) => {
      const id = section.title.toLowerCase().replace(/\s+/g, '-');
      return {
        id,
        element: document.getElementById(id),
      };
    });

    for (let i = sectionElements.length - 1; i >= 0; i--) {
      if (!sectionElements[i]?.element) continue;
      const { id, element } = sectionElements[i];
      if (element) {
        const rect = element.getBoundingClientRect();
        if (rect.top <= 200) {
          setActiveSection(id);
          break;
        }
      }
    }
  };

  // Add scroll event listener when component mounts
  useEffect(() => {
    const handleScroll = () => {
      const sectionElements = sections.map((section) => {
        const id = section.title.toLowerCase().replace(/\s+/g, '-');
        return {
          id,
          element: document.getElementById(id),
        };
      });

      for (let i = sectionElements.length - 1; i >= 0; i--) {
        if (!sectionElements[i]?.element) continue;
        const { id, element } = sectionElements[i];
        if (element) {
          const rect = element.getBoundingClientRect();
          if (rect.top <= 200) {
            setActiveSection(id);
            break;
          }
        }
      }
    };

    if (typeof window !== 'undefined')
      window.addEventListener('scroll', handleScroll);

    return () => {
      if (typeof window !== 'undefined')
        window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return (
    <main className="relative container space-y-16 py-24">
      {/* Hero Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center"
      >
        <Badge variant="secondary" className="mb-6">
          Legal Documentation
        </Badge>
        <h1 className="mb-6 text-5xl font-bold text-balance text-foreground">
          Privacy Policy
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-foreground/80">
          Effective Date:{' '}
          {new Date(
            // February 27, 2025
            '2025-02-27'
          ).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </motion.section>

      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[280px_1fr]">
        {/* Table of Contents - Fixed on Desktop */}
        <motion.aside
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="hidden lg:block"
        >
          <div className="sticky top-24">
            <Card className="p-6">
              <h2 className="mb-4 flex items-center text-lg font-semibold">
                <FileText className="mr-2 h-5 w-5 text-primary" />
                Table of Contents
              </h2>

              <div className="mb-3 flex items-center text-xs text-muted-foreground">
                <Clock className="mr-1 h-3 w-3" />
                <span>Last updated: February 27, 2025</span>
              </div>

              <Separator className="my-2" />

              <ScrollArea className="h-[calc(100vh-350px)]">
                <div className="space-y-1 py-2">
                  {tableOfContents.map((item) => (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      className={`flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
                        activeSection === item.id
                          ? 'bg-primary/10 font-medium text-primary'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      <div className="flex items-center">
                        <span className="mr-2 w-5 text-xs text-primary/70">
                          {item.number.toString().padStart(2, '0')}
                        </span>
                        {item.title}
                      </div>
                      <Check
                        className={cn(
                          'h-4 w-4 text-primary transition',
                          activeSection === item.id
                            ? 'opacity-100'
                            : 'opacity-0'
                        )}
                      />
                    </a>
                  ))}
                </div>
              </ScrollArea>
            </Card>
          </div>
        </motion.aside>

        {/* Main Content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="space-y-8"
        >
          {/* Key Points Summary */}
          <Card className="bg-primary/5 p-6">
            <div className="mb-4 flex items-center gap-3">
              <AlertCircle className="h-6 w-6 text-primary" />
              <h2 className="text-lg font-semibold">Key Privacy Principles</h2>
            </div>

            <p className="mb-4 text-sm text-muted-foreground">
              This summary highlights important aspects of our privacy practices
              but does not replace the complete policy.
            </p>

            <Table className="mt-4">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[150px]">Data Category</TableHead>
                  <TableHead>Collection Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Email Address</TableCell>
                  <TableCell className="flex items-center">
                    <Badge variant="destructive" className="mr-2">
                      Required
                    </Badge>
                    Mandatory for authentication
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">
                    Personal Details
                  </TableCell>
                  <TableCell className="flex items-center">
                    <Badge variant="outline" className="mr-2">
                      Optional
                    </Badge>
                    Name, gender, birthday, etc.
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">
                    Professional Info
                  </TableCell>
                  <TableCell className="flex items-center">
                    <Badge variant="outline" className="mr-2">
                      Optional
                    </Badge>
                    Employment details
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Payment Info</TableCell>
                  <TableCell className="flex items-center">
                    <Badge variant="secondary" className="mr-2">
                      Conditional
                    </Badge>
                    Required for paid plans, processed by Stripe
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Card>

          {/* Privacy Sections */}
          {sections.map((section, index) => (
            <motion.div
              key={section.title}
              id={section.title.toLowerCase().replace(/\s+/g, '-')}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 * index }}
              className="scroll-mt-32"
            >
              <Card className="group overflow-hidden border-l-4 border-l-primary/20 transition-all duration-200 hover:border-l-primary">
                <div className="bg-card p-8">
                  <div className="mb-5 flex items-center gap-3">
                    <div className="rounded-lg bg-primary/10 p-2 text-primary transition-transform duration-300 group-hover:scale-110 group-hover:bg-primary/20">
                      {section.icon}
                    </div>
                    <h2 className="text-2xl font-semibold">{section.title}</h2>
                  </div>
                  <div className="prose max-w-none text-card-foreground prose-gray dark:prose-invert">
                    <MemoizedReactMarkdown>
                      {section.content}
                    </MemoizedReactMarkdown>
                  </div>
                </div>
                <div className="bg-muted/50 px-8 py-3 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>
                      Section {index + 1} of {sections.length}
                    </span>
                    {index < sections.length - 1 && (
                      <a
                        href={`#${sections[index + 1]?.title.toLowerCase().replace(/\s+/g, '-')}`}
                        className="flex items-center hover:text-primary"
                      >
                        Next: {sections[index + 1]?.title}
                        <ChevronRight className="ml-1 h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              </Card>
              {index < sections.length - 1 && (
                <Separator className="my-8 opacity-50" />
              )}
            </motion.div>
          ))}

          {/* GDPR Compliance Statement */}
          <Card className="border-primary/20 p-6">
            <h3 className="text-md mb-3 flex items-center font-semibold">
              <Shield className="mr-2 h-4 w-4 text-primary" />
              GDPR & International Compliance Statement
            </h3>
            <p className="text-sm text-muted-foreground">
              Tuturuuu is committed to compliance with international data
              protection regulations, including GDPR, CCPA, and other applicable
              laws. We process personal data lawfully, fairly, and
              transparently. For EU/UK users, we serve as a data controller for
              account information and a processor for content you create.
            </p>
          </Card>
        </motion.div>
      </div>

      {/* Footer Note */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
        className="pt-12 text-center"
      >
        <p className="mx-auto max-w-2xl text-sm text-muted-foreground">
          This Privacy Policy outlines our commitment to protecting your
          personal information. For questions or concerns about your privacy,
          please contact our Data Protection Officer.
        </p>
      </motion.section>
    </main>
  );
}
