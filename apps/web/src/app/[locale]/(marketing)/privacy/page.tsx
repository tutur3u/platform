'use client';

import { MemoizedReactMarkdown } from '@/components/markdown';
import { Badge } from '@repo/ui/components/ui/badge';
import { Card } from '@repo/ui/components/ui/card';
import { ScrollArea } from '@repo/ui/components/ui/scroll-area';
import { Separator } from '@repo/ui/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui/components/ui/table';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  Baby,
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
} from 'lucide-react';

export default function PrivacyPage() {
  const sections = [
    {
      title: 'Overview',
      icon: <Shield className="h-6 w-6" />,
      content: `This Privacy Policy ("Policy") describes how Tuturuuu ("we," "our," or "us") collects, uses, and protects your personal information. 

This Policy applies to all users of our services, including our website, applications, and related services (collectively, the "Services"). 

**By using our Services, you consent to the data practices described in this Policy.**`,
    },
    {
      title: 'Information Collection',
      icon: <FileText className="h-6 w-6" />,
      content: `We collect the following categories of information:

1. **Personal Information**
   * Name and contact details
   * Account credentials
   * Payment information
   * Professional and employment information

2. **Usage Information**
   * Device and browser information
   * IP address and location data
   * Service usage patterns
   * Performance metrics

3. **User-Generated Content**
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
   * Cloud infrastructure providers
   * Payment processors
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
   * Services are not intended for users under 13
   * Parental consent required for users 13-18
   * Age verification measures

2. **Data Protection**
   * Immediate deletion of identified minor data
   * Restricted processing of minor information
   * Enhanced privacy controls

3. **Reporting Mechanisms**
   * Dedicated channels for concerns
   * Prompt investigation procedures
   * Parental involvement protocols

> If you believe we have inadvertently collected information from a minor, please contact us immediately.`,
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
      title: 'Policy Updates',
      icon: <RefreshCcw className="h-6 w-6" />,
      content: `This Privacy Policy may be updated periodically:

1. **Notification Process**
   * Email notifications for material changes
   * Website announcements
   * In-app notifications

2. **Version Control**
   * Change documentation
   * Previous version archive
   * Effective date tracking

3. **User Actions**
   * Review of changes required
   * Consent renewal if necessary
   * Opt-out options when applicable

> Changes become effective 30 days after posting unless otherwise specified.`,
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
        <h1 className="text-foreground mb-6 text-5xl font-bold text-balance">
          Privacy Policy
        </h1>
        <p className="text-foreground/80 mx-auto max-w-2xl text-lg">
          Effective Date:{' '}
          {new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </motion.section>

      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[250px_1fr]">
        {/* Table of Contents - Fixed on Desktop */}
        <motion.aside
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="hidden lg:block"
        >
          <div className="sticky top-24">
            <Card className="p-6">
              <h2 className="mb-4 text-lg font-semibold">Table of Contents</h2>
              <ScrollArea className="h-[calc(100vh-250px)]">
                <div className="space-y-2">
                  {tableOfContents.map((item) => (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      className="text-muted-foreground hover:text-foreground flex items-center gap-2 text-sm transition-colors"
                    >
                      <span className="text-primary/50 text-xs">
                        {item.number.toString().padStart(2, '0')}
                      </span>
                      {item.title}
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
            <div className="flex items-center gap-3">
              <AlertCircle className="text-primary h-6 w-6" />
              <h2 className="text-lg font-semibold">Key Privacy Principles</h2>
            </div>
            <Table className="mt-4">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Principle</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Transparency</TableCell>
                  <TableCell>
                    Clear disclosure of data collection and use
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Security</TableCell>
                  <TableCell>Robust protection of user information</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Control</TableCell>
                  <TableCell>User rights over personal data</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Compliance</TableCell>
                  <TableCell>
                    Adherence to privacy laws and regulations
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
            >
              <Card className="group overflow-hidden">
                <div className="bg-card p-6">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="text-primary transition-transform duration-300 group-hover:scale-110">
                      {section.icon}
                    </div>
                    <h2 className="text-2xl font-semibold">{section.title}</h2>
                  </div>
                  <div className="text-card-foreground prose prose-gray dark:prose-invert max-w-none">
                    <MemoizedReactMarkdown>
                      {section.content}
                    </MemoizedReactMarkdown>
                  </div>
                </div>
              </Card>
              {index < sections.length - 1 && (
                <Separator className="my-8 opacity-50" />
              )}
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* Footer Note */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
        className="text-center"
      >
        <p className="text-muted-foreground mx-auto max-w-2xl text-sm">
          This Privacy Policy is a legally binding document that outlines our
          commitment to protecting your privacy. For questions or concerns,
          please contact our Data Protection Officer.
        </p>
      </motion.section>
    </main>
  );
}
