import 'package:flutter/widgets.dart';
import 'package:mobile/core/theme/colors.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

abstract final class MobileShadTheme {
  static final light = shad.ThemeData(
    colorScheme: shad.ColorSchemes.lightZinc.copyWith(
      destructive: () => AppColors.destructiveLight,
    ),
    typography: const shad.Typography.geist().copyWith(
      sans: () => const TextStyle(fontFamily: 'NotoSans'),
    ),
  );
  static final dark = shad.ThemeData.dark(
    colorScheme: shad.ColorSchemes.darkZinc.copyWith(
      destructive: () => AppColors.destructiveDark,
    ),
    typography: const shad.Typography.geist().copyWith(
      sans: () => const TextStyle(fontFamily: 'NotoSans'),
    ),
  );
}
