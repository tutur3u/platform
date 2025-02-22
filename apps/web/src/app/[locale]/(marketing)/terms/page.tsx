'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
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
import { motion } from 'framer-motion';
import {
  AlertCircle,
  BookOpen,
  Copyright,
  Database,
  Info,
  Mail,
  RefreshCcw,
  Settings,
  Shield,
  UserX,
  Users,
} from 'lucide-react';

export default function TermsPage() {
  const sections = [
    {
      title: 'Introduction',
      icon: <BookOpen className="h-6 w-6" />,
      content: `These Terms of Service ("Terms") govern your access to and use of Tuturuuu's services, including our website, applications, and other software or services (collectively, the "Services"). By accessing or using the Services, you signify your acceptance of these Terms. If you do not agree to these Terms, you must not access or use the Services.`,
    },
    {
      title: 'Service Description',
      icon: <Info className="h-6 w-6" />,
      content: `Tuturuuu provides advanced artificial intelligence tools and technology solutions designed to enhance productivity and efficiency. Our Services include, but are not limited to:

* AI-powered assistance and automation tools
* Team collaboration platforms
* Data processing and analysis capabilities
* Cloud-based software solutions

The specific features and functionality may be modified, updated, or discontinued at our discretion.`,
    },
    {
      title: 'User Obligations',
      icon: <Users className="h-6 w-6" />,
      content: `Users of the Services must comply with the following requirements:

1. **Age Requirement:** Users must be at least 18 years of age or have obtained parental/guardian consent
2. **Account Security:** Maintain the confidentiality of account credentials and promptly notify us of any security breaches
3. **Accurate Information:** Provide and maintain accurate, current, and complete account information
4. **Compliance:** Adhere to all applicable laws, regulations, and these Terms
5. **Prohibited Activities:** Refrain from unauthorized access, interference with Services, or any malicious activities`,
    },
    {
      title: 'Intellectual Property Rights',
      icon: <Copyright className="h-6 w-6" />,
      content: `All intellectual property rights in the Services, including but not limited to software, designs, algorithms, and documentation, are owned by Tuturuuu or its licensors. 

Users are granted a **limited, non-exclusive, non-transferable license** to use the Services in accordance with these Terms. 

**Any unauthorized use, reproduction, or distribution of our intellectual property is strictly prohibited.**`,
    },
    {
      title: 'Data Processing and Privacy',
      icon: <Database className="h-6 w-6" />,
      content: `The collection, processing, and storage of user data are governed by our [Privacy Policy](/privacy), which is incorporated by reference into these Terms. 

By using the Services, you acknowledge and consent to our data practices as described in the Privacy Policy. 

We implement appropriate technical and organizational measures to protect your data.`,
    },
    {
      title: 'Modifications to Services',
      icon: <Settings className="h-6 w-6" />,
      content: `We reserve the right to modify, suspend, or discontinue any aspect of the Services at any time, with or without notice. This includes:

1. **Feature Management**
   * Adding or removing features or functionality
   * Adjusting service levels or availability

2. **Technical Updates**
   * Implementing necessary technical adjustments
   * Updating security measures

We will make reasonable efforts to notify users of significant changes that may affect their use of the Services.`,
    },
    {
      title: 'Account Termination',
      icon: <UserX className="h-6 w-6" />,
      content: `We reserve the right to suspend or terminate user accounts for:

1. **Policy Violations**
   * Violation of these Terms
   * Fraudulent or illegal activities

2. **Account Status**
   * Non-payment of applicable fees
   * Extended periods of inactivity

3. **Service Protection**
   * Any activity deemed harmful to the Services or other users

> Account termination may result in the deletion of associated data and content.`,
    },
    {
      title: 'Limitation of Liability',
      icon: <Shield className="h-6 w-6" />,
      content: `To the maximum extent permitted by law, Tuturuuu shall not be liable for:

1. **Financial Impact**
   * Direct, indirect, incidental, special, consequential, or exemplary damages
   * Loss of profits, revenue, data, or business opportunities

2. **Service Issues**
   * Service interruptions or data loss
   * Claims related to third-party services or content

3. **General Limitations**
   * Any damages arising from use or inability to use the Services

> Users acknowledge that the Services are provided "as is" without any warranties of any kind.`,
    },
    {
      title: 'Terms Modifications',
      icon: <RefreshCcw className="h-6 w-6" />,
      content: `We may modify these Terms at any time by posting the revised version on our website. 

**Important Notes:**
* Continued use of the Services after modifications constitutes acceptance
* Users are responsible for regularly reviewing these Terms
* Material changes will be communicated through appropriate channels

Changes become effective immediately upon posting unless otherwise stated.`,
    },
    {
      title: 'Contact Information',
      icon: <Mail className="h-6 w-6" />,
      content: `For inquiries regarding these Terms or our Services, please contact our legal department:

**Legal Department**  
Email: legal@tuturuuu.com  
Response Time: Within 2 business days

> For urgent matters, please include "URGENT" in the subject line.`,
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
        <h1 className="mb-6 text-5xl font-bold text-balance text-foreground">
          Terms of Service
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-foreground/80">
          Effective Date:{' '}
          {new Date(
            // January 10, 2025
            '2025-01-10'
          ).toLocaleDateString('en-US', {
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
                      className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <span className="text-xs text-primary/50">
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
              <AlertCircle className="h-6 w-6 text-primary" />
              <h2 className="text-lg font-semibold">Key Points Summary</h2>
            </div>
            <Table className="mt-4">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Topic</TableHead>
                  <TableHead>Summary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Usage</TableCell>
                  <TableCell>
                    Access to Services requires acceptance of Terms
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Rights</TableCell>
                  <TableCell>
                    All intellectual property belongs to Tuturuuu
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Privacy</TableCell>
                  <TableCell>
                    Data handling governed by Privacy Policy
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Changes</TableCell>
                  <TableCell>Terms may be updated with notice</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Card>

          {/* Terms Sections */}
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
                  <div className="prose max-w-none text-card-foreground prose-gray dark:prose-invert">
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
        <p className="mx-auto max-w-2xl text-sm text-muted-foreground">
          These Terms of Service constitute a legally binding agreement between
          you and Tuturuuu. If you have any questions about these Terms, please
          contact our legal department.
        </p>
      </motion.section>
    </main>
  );
}
