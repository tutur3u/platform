'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import {
  AlertCircle,
  BookOpen,
  Check,
  ChevronRight,
  Clock,
  Copyright,
  Database,
  FileText,
  Info,
  Mail,
  RefreshCcw,
  Settings,
  Shield,
  Users,
  UserX,
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

export default function TermsPage() {
  const [activeSection, setActiveSection] = useState<string | null>(null);

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

1. **Age Requirement:** 
   * Users must be at least 13 years of age to access our basic services
   * Users must be at least 18 years of age to access AI features
   * Parental/guardian consent is required for users aged 13-18 for non-AI features

2. **Account Security:** 
   * Maintain the confidentiality of account credentials 
   * Promptly notify us of any security breaches
   * Do not share access to your account with unauthorized users

3. **Accurate Information:** 
   * Provide and maintain accurate, current, and complete account information
   * Update your information promptly if it changes

4. **Compliance:** 
   * Adhere to all applicable laws, regulations, and these Terms
   * Follow our Community Guidelines and Acceptable Use Policy

5. **Prohibited Activities:** 
   * Refrain from unauthorized access, interference with Services, or any malicious activities
   * Do not attempt to circumvent age restrictions, particularly for AI features`,
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
          Terms of Service
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
          {/* Document Information Card */}
          <Card className="bg-primary/5 p-6">
            <div className="mb-4 flex items-center gap-3">
              <AlertCircle className="h-6 w-6 text-primary" />
              <h2 className="text-lg font-semibold">Key Points Summary</h2>
            </div>

            <p className="mb-4 text-sm text-muted-foreground">
              This summary provides a quick overview of the key terms but does
              not replace the full agreement below.
            </p>

            <Table className="mt-4">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[150px]">Topic</TableHead>
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
          These Terms of Service constitute a legally binding agreement between
          you and Tuturuuu. If you have any questions about these Terms, please
          contact our legal department.
        </p>
      </motion.section>
    </main>
  );
}
