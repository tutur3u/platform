import 'package:mobile/core/config/api_config.dart';

enum WalletImageCategory { bank, mobile }

class WalletImageOption {
  const WalletImageOption({
    required this.id,
    required this.name,
    required this.category,
  });

  final String id;
  final String name;
  final WalletImageCategory category;

  String get imageSrc => '${category.name}/$id';
}

const walletBankImages = <WalletImageOption>[
  WalletImageOption(
    id: 'abbank',
    name: 'ABBank',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(id: 'acb', name: 'ACB', category: WalletImageCategory.bank),
  WalletImageOption(id: 'anz', name: 'ANZ', category: WalletImageCategory.bank),
  WalletImageOption(
    id: 'argibank',
    name: 'Agribank',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'bac-a-bank',
    name: 'Bac A Bank',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'bangkok-bank',
    name: 'Bangkok Bank',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'bank-of-china',
    name: 'Bank of China',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'baoviet-bank',
    name: 'BaoViet Bank',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'bidc',
    name: 'BIDC',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'bidv',
    name: 'BIDV',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'cake-by-vpbank',
    name: 'Cake by VPBank',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'cathay-bank',
    name: 'Cathay Bank',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(id: 'cb', name: 'CB', category: WalletImageCategory.bank),
  WalletImageOption(
    id: 'chase-bank',
    name: 'Chase Bank',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'cimb',
    name: 'CIMB',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'citibank',
    name: 'Citibank',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'commonwealth-bank',
    name: 'Commonwealth Bank',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'deutsche-bank',
    name: 'Deutsche Bank',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'donga-bank',
    name: 'DongA Bank',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(id: 'dsb', name: 'DSB', category: WalletImageCategory.bank),
  WalletImageOption(
    id: 'eximbank',
    name: 'Eximbank',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'gpbank',
    name: 'GPBank',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'hdbank',
    name: 'HDBank',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'hong-leong-bank',
    name: 'Hong Leong Bank',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'hsbc',
    name: 'HSBC',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'industrial-bank-of-korea',
    name: 'Industrial Bank of Korea',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(id: 'ivb', name: 'IVB', category: WalletImageCategory.bank),
  WalletImageOption(id: 'kb', name: 'KB', category: WalletImageCategory.bank),
  WalletImageOption(
    id: 'keb-hana-bank',
    name: 'KEB Hana Bank',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'kienlong-bank',
    name: 'Kienlong Bank',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'lienviet-postbank',
    name: 'LienViet PostBank',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'maybank',
    name: 'Maybank',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'mb-bank',
    name: 'MB Bank',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'mega-international-commercial-bank',
    name: 'Mega Bank',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'mizuho',
    name: 'Mizuho',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(id: 'msb', name: 'MSB', category: WalletImageCategory.bank),
  WalletImageOption(
    id: 'nam-a-bank',
    name: 'Nam A Bank',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'napas',
    name: 'NAPAS',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(id: 'ncb', name: 'NCB', category: WalletImageCategory.bank),
  WalletImageOption(id: 'ocb', name: 'OCB', category: WalletImageCategory.bank),
  WalletImageOption(
    id: 'ocean-bank',
    name: 'Ocean Bank',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'pg-bank',
    name: 'PG Bank',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'public-bank',
    name: 'Public Bank',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'pvcom-bank',
    name: 'PVcomBank',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(id: 'scb', name: 'SCB', category: WalletImageCategory.bank),
  WalletImageOption(
    id: 'scotiabank',
    name: 'Scotiabank',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'sea-bank',
    name: 'SeABank',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(id: 'shb', name: 'SHB', category: WalletImageCategory.bank),
  WalletImageOption(
    id: 'shinhan-bank',
    name: 'Shinhan Bank',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'smfg',
    name: 'SMFG',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'standard-chartered',
    name: 'Standard Chartered',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'techcombank',
    name: 'Techcombank',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'timo',
    name: 'Timo',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'tpbank',
    name: 'TPBank',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'tyme',
    name: 'Tyme',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'tymebank',
    name: 'TymeBank',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'ubsp',
    name: 'UBSP',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(id: 'vib', name: 'VIB', category: WalletImageCategory.bank),
  WalletImageOption(
    id: 'viet-a-bank',
    name: 'VietABank',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'viet-capital-bank',
    name: 'Viet Capital Bank',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'vietcombank',
    name: 'Vietcombank',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'vietinbank',
    name: 'VietinBank',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'vpbank',
    name: 'VPBank',
    category: WalletImageCategory.bank,
  ),
  WalletImageOption(
    id: 'woori-bank',
    name: 'Woori Bank',
    category: WalletImageCategory.bank,
  ),
];

const walletMobileImages = <WalletImageOption>[
  WalletImageOption(
    id: 'apota',
    name: 'Apota',
    category: WalletImageCategory.mobile,
  ),
  WalletImageOption(
    id: 'baokim',
    name: 'BaoKim',
    category: WalletImageCategory.mobile,
  ),
  WalletImageOption(
    id: 'ecpay',
    name: 'ECPay',
    category: WalletImageCategory.mobile,
  ),
  WalletImageOption(
    id: 'grabpay-by-moca',
    name: 'GrabPay by Moca',
    category: WalletImageCategory.mobile,
  ),
  WalletImageOption(
    id: 'moca',
    name: 'Moca',
    category: WalletImageCategory.mobile,
  ),
  WalletImageOption(
    id: 'momo',
    name: 'MoMo',
    category: WalletImageCategory.mobile,
  ),
  WalletImageOption(
    id: 'nextpay',
    name: 'NextPay',
    category: WalletImageCategory.mobile,
  ),
  WalletImageOption(
    id: 'ngan-luong',
    name: 'Ngan Luong',
    category: WalletImageCategory.mobile,
  ),
  WalletImageOption(
    id: 'payme',
    name: 'PayMe',
    category: WalletImageCategory.mobile,
  ),
  WalletImageOption(
    id: 'payoo',
    name: 'Payoo',
    category: WalletImageCategory.mobile,
  ),
  WalletImageOption(
    id: 'shopeepay',
    name: 'ShopeePay',
    category: WalletImageCategory.mobile,
  ),
  WalletImageOption(
    id: 'truemoney',
    name: 'TrueMoney',
    category: WalletImageCategory.mobile,
  ),
  WalletImageOption(
    id: 'viettel-money',
    name: 'Viettel Money',
    category: WalletImageCategory.mobile,
  ),
  WalletImageOption(
    id: 'viettel-pay',
    name: 'ViettelPay',
    category: WalletImageCategory.mobile,
  ),
  WalletImageOption(
    id: 'vimo',
    name: 'Vimo',
    category: WalletImageCategory.mobile,
  ),
  WalletImageOption(
    id: 'vinid',
    name: 'VinID',
    category: WalletImageCategory.mobile,
  ),
  WalletImageOption(
    id: 'vnpay',
    name: 'VNPay',
    category: WalletImageCategory.mobile,
  ),
  WalletImageOption(
    id: 'vnpay-money',
    name: 'VNPay Money',
    category: WalletImageCategory.mobile,
  ),
  WalletImageOption(
    id: 'vtcpay',
    name: 'VTCPay',
    category: WalletImageCategory.mobile,
  ),
  WalletImageOption(
    id: 'zalopay',
    name: 'ZaloPay',
    category: WalletImageCategory.mobile,
  ),
];

const walletImageOptions = <WalletImageOption>[
  ...walletBankImages,
  ...walletMobileImages,
];

String walletImageUrl(String imageSrc) {
  final baseUrl = ApiConfig.baseUrl.replaceFirst(RegExp(r'/$'), '');
  return '$baseUrl/media/apps/tutrack/$imageSrc-square.svg';
}

WalletImageOption? findWalletImageBySrc(String? imageSrc) {
  if (imageSrc == null || imageSrc.trim().isEmpty) {
    return null;
  }
  for (final item in walletImageOptions) {
    if (item.imageSrc == imageSrc) {
      return item;
    }
  }
  return null;
}

List<WalletImageOption> filterWalletImages(
  List<WalletImageOption> source,
  String query,
) {
  final normalized = query.trim().toLowerCase();
  if (normalized.isEmpty) {
    return source;
  }

  return source
      .where(
        (item) =>
            item.name.toLowerCase().contains(normalized) ||
            item.id.toLowerCase().contains(normalized),
      )
      .toList(growable: false);
}
