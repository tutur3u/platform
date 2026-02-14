import { Facebook, Github, Instagram, Linkedin } from '@ncthub/ui/icons';
import { Separator } from '@ncthub/ui/separator';
import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import FooterCTA from './FooterCTA';
export default async function Footer() {
  const t = await getTranslations();

  return (
    <div className="w-full px-0 text-center md:px-4 lg:px-10">
      <Separator className="mt-8 mb-5 bg-foreground/5" />
      {/* Client component with motion */}
      <FooterCTA />

      <Separator className="mt-8 h-1 bg-linear-to-r from-[#5FC6E5] to-[#FBC821] blur-sm" />

      <div className="flex flex-col items-center justify-between gap-12 px-4 py-8 md:px-32 md:py-24 lg:flex-row">
        <div className="flex w-fit flex-col items-center gap-6">
          <Link href="/" aria-label="Neo Culture Tech">
            <div className="aspect-square w-20 items-start md:w-24 lg:w-28">
              <Image
                src="/media/logos/nct-logo-only-light-new.png"
                alt="NCT logo"
                width={112}
                height={112}
                className="h-full w-full object-contain"
              />
            </div>
          </Link>

          {/* Social Media Icons */}
          <div className="flex items-center justify-between gap-8">
            <Link
              href="https://www.facebook.com/rmit.nct"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground/50 transition-colors hover:text-foreground"
              aria-label="Facebook"
            >
              <Facebook className="h-6 w-6" />
            </Link>
            <Link
              href="https://instagram.com/rmitnct"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground/50 transition-colors hover:text-foreground"
              aria-label="Instagram"
            >
              <Instagram className="h-6 w-6" />
            </Link>
            <Link
              href="https://linkedin.com/company/rmit-nct"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground/50 transition-colors hover:text-foreground"
              aria-label="LinkedIn"
            >
              <Linkedin className="h-6 w-6" />
            </Link>
            <Link
              href="https://github.com/rmit-nct/hub"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground/50 transition-colors hover:text-foreground"
              aria-label="GitHub"
            >
              <Github className="h-6 w-6" />
            </Link>
          </div>
        </div>

        <div className="flex flex-col flex-wrap items-center gap-8 md:flex-row md:items-start md:gap-16">
          <div className="flex flex-col items-start gap-1">
            <div className="font-semibold text-lg uppercase lg:text-xl">
              {t('common.legal')}
            </div>

            <Link
              href="/terms"
              target="_blank"
              className="text-foreground/50 hover:text-foreground/80"
            >
              {t('common.terms')}
            </Link>

            <Link
              href="/privacy"
              target="_blank"
              className="text-foreground/50 hover:text-foreground/80"
            >
              {t('common.privacy')}
            </Link>
          </div>
          <div className="flex flex-col items-start gap-1">
            <div className="font-semibold text-lg uppercase md:text-xl">
              {t('common.resources')}
            </div>

            <Link
              href="/meet-together"
              className="text-foreground/50 hover:text-foreground/80"
            >
              {t('common.meet-together')}
            </Link>
          </div>
          <div className="flex flex-col items-start gap-1">
            <div className="font-semibold text-lg uppercase md:text-xl">
              {t('common.developers')}
            </div>
            <Link
              href="https://github.com/rmit-nct/hub"
              target="_blank"
              className="text-foreground/50 hover:text-foreground/80 hover:underline"
            >
              {t('common.open-source')}
            </Link>

            <Link
              href="https://docs.rmitnct.club"
              target="_blank"
              className="text-foreground/50 hover:text-foreground/80"
            >
              {t('common.documentation')}
            </Link>
          </div>
          <div className="flex flex-col items-start gap-1">
            <div className="font-semibold text-lg uppercase md:text-xl">
              Our Address:
            </div>

            <div className="text-left text-foreground/50 hover:text-foreground/80">
              702 Nguyen Van Linh, Tan Hung Ward, <br /> Ho Chi Minh City,
              Vietnam
            </div>
          </div>
        </div>
      </div>

      <div className="text-balance p-4 text-center text-sm opacity-80 md:px-32 xl:px-64">
        {t('common.copyright')}
      </div>
    </div>
  );
}
