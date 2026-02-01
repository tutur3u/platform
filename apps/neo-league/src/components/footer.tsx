import {
  Facebook,
  Globe,
  Instagram,
  Linkedin,
  Mail,
  Phone,
} from '@ncthub/ui/icons';
import Image from 'next/image';
import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="border-primary/10 border-t bg-background py-12">
      <div className="mx-auto max-w-7xl space-y-8 px-6">
        {/* Top Section - Logos */}
        <div className="flex flex-col justify-between gap-8 md:flex-row md:items-center">
          {/* Neo League Logo */}
          <div className="w-80">
            <Image
              src="/logo.png"
              alt="Neo League Logo"
              width={350}
              height={100}
              className="w-full"
            />
          </div>

          {/* Partner Logos */}
          <div className="flex items-center gap-6">
            <Image
              src="/rmit_sset.png"
              alt="RMIT SSET"
              width={200}
              height={100}
              className="h-10 w-auto object-contain"
            />
            <Image
              src="/rmit_nct.png"
              alt="RMIT NCT"
              width={200}
              height={100}
              className="h-10 w-auto object-contain"
            />
            <Image
              src="/rmit_student_club_program.png"
              alt="RMIT Student Club Program"
              width={200}
              height={100}
              className="h-10 w-auto object-contain"
            />
          </div>
        </div>

        {/* Main Footer Content */}
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {/* Our Socials */}
          <div className="space-y-4">
            <h3 className="font-black text-brand-dark-blue text-lg">
              Our Socials
            </h3>
            <div className="flex gap-4">
              <Link
                href="https://facebook.com/RMITNeoCultureTech"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary transition-colors hover:text-primary/70"
                aria-label="Facebook"
              >
                <Facebook className="h-8 w-8" />
              </Link>
              <Link
                href="https://instagram.com/rmitnct"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary transition-colors hover:text-primary/70"
                aria-label="Instagram"
              >
                <Instagram className="h-8 w-8" />
              </Link>
              <Link
                href="https://linkedin.com/company/rmitnct"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary transition-colors hover:text-primary/70"
                aria-label="LinkedIn"
              >
                <Linkedin className="h-8 w-8" />
              </Link>
            </div>
          </div>

          {/* Contact Us */}
          <div className="space-y-4">
            <h3 className="font-black text-brand-dark-blue text-lg">
              Contact Us
            </h3>
            <div className="space-y-2 text-primary text-sm">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                <div>
                  <p>
                    <span className="font-bold">Ngo Van Tai</span>
                    <span> - Co-Project Leader</span>
                  </p>
                  <span className="font-bold">0918498056</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                <div>
                  <p>
                    <span className="font-bold">Nguyen Ha Gia Tam</span>
                    <span> - Co-Project Leader</span>
                  </p>
                  <span className="font-bold">0765386296</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                <a
                  href="mailto:neoculturetechclub.sgs@rmit.edu.vn"
                  className="font-bold hover:underline"
                >
                  neoculturetechclub.sgs@rmit.edu.vn
                </a>
              </div>
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                <a
                  href="https://rmitnct.club"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold hover:underline"
                >
                  rmitnct.club
                </a>
              </div>
            </div>
          </div>

          {/* Core Values */}
          <div className="space-y-4">
            <h3 className="font-black text-brand-dark-blue text-lg">
              Core Values
            </h3>
            <ul className="space-y-1 font-bold text-sm tracking-wide">
              <li>CULTURE</li>
              <li>REVOLUTIONARY</li>
              <li>COMPANIONSHIP</li>
              <li>DIVERSITY</li>
              <li>INCLUSION</li>
            </ul>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="border-primary/10 border-t pt-8 text-center">
          <p className="text-primary text-sm">
            © 2026 RMIT NEO Culture Technology Club. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
