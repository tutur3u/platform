'use client';

import { Badge } from '@repo/ui/components/ui/badge';
import { Button } from '@repo/ui/components/ui/button';
import { Card } from '@repo/ui/components/ui/card';
import {
  Cloud,
  Copy,
  FileSearch,
  FileType2,
  HardDrive,
  History,
  Lock,
  RefreshCcw,
  Share2,
  ShieldCheck,
  Smartphone,
  Users,
} from 'lucide-react';

const features = [
  {
    title: 'Secure Storage',
    description:
      'Enterprise-grade encryption and security for all your files and data.',
    icon: <Lock className="h-6 w-6" />,
  },
  {
    title: 'File Sharing',
    description:
      'Share files and folders with customizable access permissions and links.',
    icon: <Share2 className="h-6 w-6" />,
  },
  {
    title: 'File Search',
    description:
      'Powerful search capabilities to find files quickly across your storage.',
    icon: <FileSearch className="h-6 w-6" />,
  },
  {
    title: 'Cross-Platform',
    description:
      'Access your files from any device with web and mobile applications.',
    icon: <Smartphone className="h-6 w-6" />,
  },
  {
    title: 'Version Control',
    description:
      'Track file changes and restore previous versions when needed.',
    icon: <History className="h-6 w-6" />,
  },
  {
    title: 'File Organization',
    description:
      'Smart organization tools with folders, tags, and metadata management.',
    icon: <FileType2 className="h-6 w-6" />,
  },
];

const useCases = [
  {
    title: 'Business Storage',
    items: [
      'Document management',
      'Team file sharing',
      'Backup solutions',
      'Client file delivery',
    ],
  },
  {
    title: 'Collaboration',
    items: [
      'Project file sharing',
      'Real-time co-editing',
      'File commenting',
      'Access control',
    ],
  },
  {
    title: 'Data Management',
    items: [
      'File versioning',
      'Audit trails',
      'Data retention',
      'Recovery options',
    ],
  },
];

export default function DriveProductPage() {
  return (
    <div className="container mx-auto mt-8 flex max-w-6xl flex-col gap-6 px-3 py-16 lg:gap-14 lg:py-24">
      {/* Hero Section */}
      <div className="mb-16 text-center">
        <Badge variant="secondary" className="mb-4">
          Coming Soon
        </Badge>
        <h1 className="mb-4 text-4xl font-bold">Cloud Storage Solution</h1>
        <p className="text-muted-foreground mx-auto max-w-2xl text-lg">
          Secure, scalable, and efficient cloud storage for your business.
          Store, share, and manage files with enterprise-grade security and
          collaboration features.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Button size="lg" disabled>
            Join Waitlist
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a href="/contact">Contact Sales</a>
          </Button>
        </div>
      </div>

      {/* Trust Section */}
      <section className="mb-24">
        <Card className="border-primary bg-primary/5 p-8">
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 text-center">
            <ShieldCheck className="text-primary h-12 w-12" />
            <h2 className="text-2xl font-bold">Enterprise-Grade Security</h2>
            <p className="text-muted-foreground">
              Your data is protected with end-to-end encryption, advanced access
              controls, and compliance with industry security standards.
            </p>
          </div>
        </Card>
      </section>

      {/* Features Grid */}
      <section className="mb-24">
        <h2 className="mb-12 text-center text-3xl font-bold">
          Powerful Features
        </h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Card key={feature.title} className="p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="text-primary">{feature.icon}</div>
                <h3 className="text-xl font-semibold">{feature.title}</h3>
              </div>
              <p className="text-muted-foreground">{feature.description}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Use Cases */}
      <section className="mb-24">
        <h2 className="mb-12 text-center text-3xl font-bold">Use Cases</h2>
        <div className="grid gap-8 md:grid-cols-3">
          {useCases.map((useCase) => (
            <Card key={useCase.title} className="p-6">
              <HardDrive className="text-primary mb-4 h-8 w-8" />
              <h3 className="mb-4 text-xl font-semibold">{useCase.title}</h3>
              <ul className="text-muted-foreground space-y-2">
                {useCase.items.map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="bg-primary h-1.5 w-1.5 rounded-full" />
                    {item}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>

      {/* Cloud Features Section */}
      <section className="mb-24">
        <Card className="overflow-hidden">
          <div className="grid md:grid-cols-2">
            <div className="border-border flex flex-col justify-center gap-4 border-b p-8 md:border-b-0 md:border-r">
              <Cloud className="text-primary h-8 w-8" />
              <h3 className="text-2xl font-bold">Cloud-Native</h3>
              <p className="text-muted-foreground">
                Built for the cloud with automatic backups, scalable storage,
                and always-on availability.
              </p>
            </div>
            <div className="flex flex-col justify-center gap-4 p-8">
              <RefreshCcw className="text-primary h-8 w-8" />
              <h3 className="text-2xl font-bold">Seamless Sync</h3>
              <p className="text-muted-foreground">
                Keep your files in sync across all devices with real-time
                updates and offline access.
              </p>
            </div>
          </div>
        </Card>
      </section>

      {/* Additional Features Section */}
      <section className="mb-24">
        <h2 className="mb-12 text-center text-3xl font-bold">
          Collaboration Tools
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="p-6">
            <Users className="text-primary mb-4 h-8 w-8" />
            <h3 className="mb-2 text-xl font-bold">Team Workspace</h3>
            <p className="text-muted-foreground">
              Create shared spaces for teams to collaborate on files and
              projects efficiently.
            </p>
          </Card>
          <Card className="p-6">
            <Copy className="text-primary mb-4 h-8 w-8" />
            <h3 className="mb-2 text-xl font-bold">File Management</h3>
            <p className="text-muted-foreground">
              Advanced file management with custom metadata, tags, and automated
              workflows.
            </p>
          </Card>
        </div>
      </section>
    </div>
  );
}
