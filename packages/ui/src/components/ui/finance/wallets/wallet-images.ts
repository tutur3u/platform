/**
 * Wallet image definitions for bank and mobile payment providers.
 * Images are stored in /media/apps/tutrack/ with variants:
 * - {id}-square.svg (used for icons)
 * - {id}-horizontal-fit.svg
 * - {id}-in-a-frame.svg
 */

export interface WalletImage {
  /** Unique identifier (e.g., "bidv", "momo") */
  id: string;
  /** Display name */
  name: string;
  /** Category: bank or mobile */
  category: 'bank' | 'mobile';
}

/**
 * Bank images (64 banks)
 */
export const WALLET_BANK_IMAGES: WalletImage[] = [
  { id: 'abbank', name: 'ABBank', category: 'bank' },
  { id: 'acb', name: 'ACB', category: 'bank' },
  { id: 'anz', name: 'ANZ', category: 'bank' },
  { id: 'argibank', name: 'Agribank', category: 'bank' },
  { id: 'bac-a-bank', name: 'Bac A Bank', category: 'bank' },
  { id: 'bangkok-bank', name: 'Bangkok Bank', category: 'bank' },
  { id: 'bank-of-china', name: 'Bank of China', category: 'bank' },
  { id: 'baoviet-bank', name: 'BaoViet Bank', category: 'bank' },
  { id: 'bidc', name: 'BIDC', category: 'bank' },
  { id: 'bidv', name: 'BIDV', category: 'bank' },
  { id: 'cake-by-vpbank', name: 'Cake by VPBank', category: 'bank' },
  { id: 'cathay-bank', name: 'Cathay Bank', category: 'bank' },
  { id: 'cb', name: 'CB', category: 'bank' },
  { id: 'chase-bank', name: 'Chase Bank', category: 'bank' },
  { id: 'cimb', name: 'CIMB', category: 'bank' },
  { id: 'citibank', name: 'Citibank', category: 'bank' },
  { id: 'commonwealth-bank', name: 'Commonwealth Bank', category: 'bank' },
  { id: 'deutsche-bank', name: 'Deutsche Bank', category: 'bank' },
  { id: 'donga-bank', name: 'DongA Bank', category: 'bank' },
  { id: 'dsb', name: 'DSB', category: 'bank' },
  { id: 'eximbank', name: 'Eximbank', category: 'bank' },
  { id: 'gpbank', name: 'GPBank', category: 'bank' },
  { id: 'hdbank', name: 'HDBank', category: 'bank' },
  { id: 'hong-leong-bank', name: 'Hong Leong Bank', category: 'bank' },
  { id: 'hsbc', name: 'HSBC', category: 'bank' },
  { id: 'industrial-bank-of-korea', name: 'Industrial Bank of Korea', category: 'bank' },
  { id: 'ivb', name: 'IVB', category: 'bank' },
  { id: 'kb', name: 'KB', category: 'bank' },
  { id: 'keb-hana-bank', name: 'KEB Hana Bank', category: 'bank' },
  { id: 'kienlong-bank', name: 'Kienlong Bank', category: 'bank' },
  { id: 'lienviet-postbank', name: 'LienViet PostBank', category: 'bank' },
  { id: 'maybank', name: 'Maybank', category: 'bank' },
  { id: 'mb-bank', name: 'MB Bank', category: 'bank' },
  { id: 'mega-international-commercial-bank', name: 'Mega Bank', category: 'bank' },
  { id: 'mizuho', name: 'Mizuho', category: 'bank' },
  { id: 'msb', name: 'MSB', category: 'bank' },
  { id: 'nam-a-bank', name: 'Nam A Bank', category: 'bank' },
  { id: 'napas', name: 'NAPAS', category: 'bank' },
  { id: 'ncb', name: 'NCB', category: 'bank' },
  { id: 'ocb', name: 'OCB', category: 'bank' },
  { id: 'ocean-bank', name: 'Ocean Bank', category: 'bank' },
  { id: 'pg-bank', name: 'PG Bank', category: 'bank' },
  { id: 'public-bank', name: 'Public Bank', category: 'bank' },
  { id: 'pvcom-bank', name: 'PVcomBank', category: 'bank' },
  { id: 'scb', name: 'SCB', category: 'bank' },
  { id: 'scotiabank', name: 'Scotiabank', category: 'bank' },
  { id: 'sea-bank', name: 'SeABank', category: 'bank' },
  { id: 'shb', name: 'SHB', category: 'bank' },
  { id: 'shinhan-bank', name: 'Shinhan Bank', category: 'bank' },
  { id: 'smfg', name: 'SMFG', category: 'bank' },
  { id: 'standard-chartered', name: 'Standard Chartered', category: 'bank' },
  { id: 'techcombank', name: 'Techcombank', category: 'bank' },
  { id: 'timo', name: 'Timo', category: 'bank' },
  { id: 'tpbank', name: 'TPBank', category: 'bank' },
  { id: 'tyme', name: 'Tyme', category: 'bank' },
  { id: 'tymebank', name: 'TymeBank', category: 'bank' },
  { id: 'ubsp', name: 'UBSP', category: 'bank' },
  { id: 'vib', name: 'VIB', category: 'bank' },
  { id: 'viet-a-bank', name: 'VietABank', category: 'bank' },
  { id: 'viet-capital-bank', name: 'Viet Capital Bank', category: 'bank' },
  { id: 'vietcombank', name: 'Vietcombank', category: 'bank' },
  { id: 'vietinbank', name: 'VietinBank', category: 'bank' },
  { id: 'vpbank', name: 'VPBank', category: 'bank' },
  { id: 'woori-bank', name: 'Woori Bank', category: 'bank' },
];

/**
 * Mobile payment images (20 providers)
 */
export const WALLET_MOBILE_IMAGES: WalletImage[] = [
  { id: 'apota', name: 'Apota', category: 'mobile' },
  { id: 'baokim', name: 'BaoKim', category: 'mobile' },
  { id: 'ecpay', name: 'ECPay', category: 'mobile' },
  { id: 'grabpay-by-moca', name: 'GrabPay by Moca', category: 'mobile' },
  { id: 'moca', name: 'Moca', category: 'mobile' },
  { id: 'momo', name: 'MoMo', category: 'mobile' },
  { id: 'nextpay', name: 'NextPay', category: 'mobile' },
  { id: 'ngan-luong', name: 'Ngan Luong', category: 'mobile' },
  { id: 'payme', name: 'PayMe', category: 'mobile' },
  { id: 'payoo', name: 'Payoo', category: 'mobile' },
  { id: 'shopeepay', name: 'ShopeePay', category: 'mobile' },
  { id: 'truemoney', name: 'TrueMoney', category: 'mobile' },
  { id: 'viettel-money', name: 'Viettel Money', category: 'mobile' },
  { id: 'viettel-pay', name: 'ViettelPay', category: 'mobile' },
  { id: 'vimo', name: 'Vimo', category: 'mobile' },
  { id: 'vinid', name: 'VinID', category: 'mobile' },
  { id: 'vnpay', name: 'VNPay', category: 'mobile' },
  { id: 'vnpay-money', name: 'VNPay Money', category: 'mobile' },
  { id: 'vtcpay', name: 'VTCPay', category: 'mobile' },
  { id: 'zalopay', name: 'ZaloPay', category: 'mobile' },
];

/**
 * All wallet images combined
 */
export const ALL_WALLET_IMAGES: WalletImage[] = [
  ...WALLET_BANK_IMAGES,
  ...WALLET_MOBILE_IMAGES,
];

/**
 * Get the full path to a wallet image
 * @param imageSrc The image source identifier (e.g., "bank/bidv" or "mobile/momo")
 * @returns The full path to the square SVG image
 */
export function getWalletImagePath(imageSrc: string): string {
  return `/media/apps/tutrack/${imageSrc}-square.svg`;
}

/**
 * Get wallet image metadata by its full image_src value
 * @param imageSrc The image source (e.g., "bank/bidv")
 * @returns The WalletImage metadata or undefined if not found
 */
export function getWalletImageById(imageSrc: string): WalletImage | undefined {
  const [category, id] = imageSrc.split('/');
  if (category === 'bank') {
    return WALLET_BANK_IMAGES.find((img) => img.id === id);
  }
  if (category === 'mobile') {
    return WALLET_MOBILE_IMAGES.find((img) => img.id === id);
  }
  return undefined;
}

/**
 * Build the image_src value from category and id
 * @param category The category ('bank' or 'mobile')
 * @param id The image id
 * @returns The combined image_src value (e.g., "bank/bidv")
 */
export function buildImageSrc(category: 'bank' | 'mobile', id: string): string {
  return `${category}/${id}`;
}

/**
 * Filter wallet images by search query
 * Matches against name and id
 */
export function filterWalletImages(
  images: WalletImage[],
  query: string
): WalletImage[] {
  if (!query.trim()) return images;
  const searchTerm = query.toLowerCase().trim();
  return images.filter(
    (img) =>
      img.name.toLowerCase().includes(searchTerm) ||
      img.id.toLowerCase().includes(searchTerm)
  );
}
