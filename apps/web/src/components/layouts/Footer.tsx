import FooterCTA from './FooterCTA';
import { Separator } from '@ncthub/ui/separator';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

export default async function Footer() {
  const t = await getTranslations();

  return (
    <div className="w-full px-0 text-center md:px-4 lg:px-10">
      <Separator className="mt-8 mb-5 bg-foreground/5" />
      {/* Client component with motion */}
      <FooterCTA />

      <Separator className="mt-8 h-1 bg-gradient-to-r from-[#5FC6E5] to-[#FBC821] blur-sm" />

      <div className="mx-auto flex flex-col items-center justify-evenly gap-5 py-8 md:flex-row md:py-24">
        <Link
          href="/"
          className="flex items-center justify-center transition md:flex-col md:items-start md:justify-start dark:hover:text-blue-200"
          aria-label="Neo Culture Tech"
        >
          <div className="aspect-square w-24 items-start md:mb-4 md:w-28 lg:w-32">
            <svg
              width="100%"
              height="100%"
              viewBox="0 0 890 787"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M508.595 785.779C503.749 788.982 501.241 784.992 498.445 783.274C467.518 764.277 436.72 745.07 405.883 725.927C384.949 712.932 364.116 699.767 342.997 687.08C337.258 683.632 334.751 679.526 334.03 672.857C329.06 626.897 323.674 580.982 318.433 535.052C315.306 507.642 312.197 480.232 308.487 452.236C300.644 443.971 303.86 433.919 302.634 425.122C300.085 406.832 297.809 388.432 296.373 369.085C294.62 337.343 289.769 306.816 286.708 276.106C283.48 243.728 279.316 211.458 275.848 179.109C272.417 147.091 268.208 115.156 265.016 83.115C263.912 72.028 260.151 60.892 264.326 48.748C281.213 42.42 298.461 39.067 315.46 34.771C343.763 27.618 372.199 20.989 401.372 14.052C409.134 14.597 414.447 18.775 420.097 22.269C438.514 33.656 456.631 45.538 475.281 56.532C485.017 62.271 490.256 70.086 491.393 81.278C494.486 111.737 498.783 142.063 501.887 172.52C505.664 209.6 510.455 246.557 514.744 283.574C518.497 315.96 521.761 348.401 525.895 381.627C526.421 405.83 530.415 428.815 532.925 451.939C536.439 484.323 540.575 516.636 544.165 549.014C547.609 580.072 551.019 611.134 554.884 642.146C557.268 661.276 559.652 680.415 560.896 700.493C561.133 706.6 558.65 710.982 555.982 715.182C542.628 736.207 529.305 757.251 516.097 778.368C514.305 781.233 512.277 783.802 508.595 785.778V785.779Z"
                fill="#032639"
                stroke="#4896AC" //7DF9FF
                strokeWidth="10"
              />
              <path
                d="M263.89 48.228C267.59 61.504 268.209 75.471 269.846 89.292C275.164 134.196 280.106 179.145 285.152 224.081C288.862 257.125 292.608 290.166 296.136 323.23C297.652 337.433 300.381 351.527 300.068 366.77C295.584 383.444 285.004 395.795 276.57 409.241C245.603 458.609 214.866 508.121 183.752 557.396C180.237 562.963 177.623 569.327 171.196 573.604C167.67 577.692 165.267 574.608 162.964 573.204C151.314 566.104 139.714 558.919 128.17 551.645C87.63 526.092 47.104 500.517 6.592 474.92C-1.001 470.124 -1.824 471.794 4.096 462.337C15.043 444.847 25.946 427.327 36.891 409.836C109.444 293.88 182.005 177.929 254.575 61.983C257.513 57.2869 260.62 52.6989 263.89 48.228ZM559.134 703.833C554.448 681.363 552.894 658.753 550.097 636.299C546.024 603.596 542.283 570.851 538.46 538.118C535.795 515.305 533.242 492.48 530.616 469.663C527.798 445.186 524.916 420.716 522.158 396.232C521.675 391.938 521.669 387.59 521.576 382.322C532.754 354.488 551.289 332.034 565.809 307.2C569.583 300.745 571.966 293.07 579.532 288.663C586.342 281.184 590.982 272.763 596.029 264.623C598.233 261.068 600.7 258.799 605.081 257.779C649.948 247.332 694.753 236.623 740.335 225.984C744.914 226.076 748.128 227.775 751.245 229.769C771.16 242.512 791.36 254.798 811.382 267.369C827.102 277.237 828.008 281.189 818.112 297.015C771.15 372.115 723.985 447.088 676.919 522.123C641.001 579.385 605.252 636.753 569.039 693.83C566.591 697.687 564.666 702.195 559.134 703.833Z"
                fill="#032639"
                stroke="#4896AC"
                strokeWidth="10"
              />
              <path
                d="M558.177 704.365C579.763 669.947 601.21 636.282 622.442 602.482C671.842 523.842 721.147 445.142 770.47 366.452C787.088 339.94 803.684 313.414 820.196 286.835C824.42 280.037 824.323 279.825 817.42 275.485C794.316 260.955 771.151 246.523 748.036 232.012C745.801 230.609 743.745 228.921 741.35 226.673C758.144 220.245 775.933 217.45 793.255 212.803C796.252 211.999 798.427 213.254 800.683 214.673C828.881 232.39 857.093 250.085 885.243 267.877C890.487 271.191 890.459 271.433 886.439 277.974C858.532 323.377 830.846 368.917 802.597 414.106C740.983 512.668 679.091 611.056 617.277 709.493C604.877 729.239 592.198 748.812 579.924 768.635C577.394 772.721 574.21 774.833 569.731 775.627C549.746 779.165 529.767 782.732 508.941 786.317C511.848 777.452 517.478 769.647 522.534 761.521C534.269 742.657 546.13 723.872 558.177 704.365ZM579.95 287.843C573.362 303.113 563.946 316.07 555.6 329.662C544.97 346.971 533.93 364.027 522.388 381.284C517.525 344.337 513.385 307.293 509.146 270.26C505.512 238.502 501.756 206.757 498.073 175.004C494.163 141.282 490.161 107.569 486.499 73.82C485.949 68.752 483.274 66.335 479.423 63.948C457.059 50.086 434.776 36.095 412.495 22.099C409.142 19.992 405.375 18.408 402.54 14.518C418.89 8.36601 436.333 5.55601 453.263 0.76801C456.223 -0.0709904 458.437 1.01101 460.723 2.42501C490.153 20.628 519.563 38.862 549.032 57.002C552.176 58.938 553.476 61.407 553.881 65.059C557.869 101.083 562.026 137.088 566.128 173.099C570.27 209.455 574.397 245.813 578.564 282.166C578.752 283.81 579.274 285.415 579.95 287.843Z"
                fill="#032639"
                stroke="#F9B61D"
                strokeWidth="10"
              />
              <path
                d="M171.483 574.163C170.204 571.496 172.008 569.775 173.21 567.853C214.192 502.339 255.188 436.835 296.199 371.34C296.9 370.22 297.798 369.221 299.25 367.907C302.28 388.44 304.694 409.227 307.026 430.025C307.764 436.608 309.107 443.177 307.946 450.754C286.869 484.844 265.659 517.924 244.973 551.33C240.785 558.092 236.1 562.004 228.115 563.358C209.428 566.528 190.883 570.54 171.483 574.163Z"
                fill="#032639"
                stroke="#4896AC"
                strokeWidth="10"
              />
            </svg>
          </div>
        </Link>
        <div className="flex flex-col gap-1">
          <div className="text-lg font-semibold uppercase md:w-fit lg:text-xl">
            {t('common.legal')}
          </div>

          <Link
            href="/terms"
            target="_blank"
            className="text-foreground/50 hover:text-foreground hover:underline md:w-fit"
          >
            {t('common.terms')}
          </Link>

          <Link
            href="/privacy"
            target="_blank"
            className="text-foreground/50 hover:text-foreground hover:underline md:w-fit"
          >
            {t('common.privacy')}
          </Link>
        </div>
        <div className="flex flex-col gap-1">
          <div className="text-lg font-semibold uppercase md:w-fit md:text-xl">
            {t('common.resources')}
          </div>

          <Link
            href="/meet-together"
            className="text-foreground/50 hover:text-foreground hover:underline md:w-fit"
          >
            {t('common.meet-together')}
          </Link>

          <Link
            href="/qr-generator"
            className="text-foreground/50 hover:text-foreground hover:underline md:w-fit"
          >
            {t('common.qr_generator')}
          </Link>
        </div>
        <div className="flex flex-col gap-1">
          <div className="text-lg font-semibold uppercase md:w-fit md:text-xl">
            {t('common.developers')}
          </div>
          <Link
            href="https://github.com/rmit-nct/hub"
            target="_blank"
            className="text-foreground/50 hover:text-foreground hover:underline md:w-fit"
          >
            {t('common.open-source')}
          </Link>

          <Link
            href="https://tuturuuu.com"
            target="_blank"
            className="text-foreground/50 hover:text-foreground hover:underline md:w-fit"
          >
            Tuturuuu
          </Link>
        </div>
        <div className="flex flex-col gap-1">
          <div className="text-lg font-semibold uppercase md:w-fit md:text-xl">
            Our Address:
          </div>

          <div className="text-foreground/50 hover:text-foreground hover:underline md:w-fit md:text-left">
            702 Nguyen Van Linh, Tan Hung ward, <br /> District 7, Ho Chi Minh
            City, Vietnam
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col items-center justify-between gap-4 pb-4 md:flex-row">
        <div className="text-center opacity-80">{t('common.copyright')}</div>
        <Link
          href="mailto:neoculturetechclub.sgs@rmit.edu.vn"
          className="font-semibold text-brand-light-red underline"
        >
          neoculturetechclub.sgs@rmit.edu.vn
        </Link>
      </div>
    </div>
  );
}
