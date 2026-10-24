import 'package:flutter/widgets.dart';

/// Type scale of the mobile design system.
///
/// Names and sizes match the legacy shadcn typography so existing screens keep
/// their metrics during migration. Styles carry no colour; components apply
/// `AppColorTokens` roles. Text scaling comes from `MediaQuery.textScaler`, so
/// never clamp it here.
@immutable
class AppTypography {
  const AppTypography({this.fontFamily = 'NotoSans'});

  final String fontFamily;

  TextStyle _style(double size, [FontWeight weight = FontWeight.w400]) =>
      TextStyle(fontFamily: fontFamily, fontSize: size, fontWeight: weight);

  // Size scale.
  TextStyle get xSmall => _style(12);
  TextStyle get small => _style(14);
  TextStyle get base => _style(16);
  TextStyle get large => _style(18);
  TextStyle get xLarge => _style(20);
  TextStyle get x2Large => _style(24);
  TextStyle get x3Large => _style(30);

  // Roles.
  TextStyle get h1 => _style(36, FontWeight.w800);
  TextStyle get h2 => _style(30, FontWeight.w600);
  TextStyle get h3 => _style(24, FontWeight.w600);
  TextStyle get h4 => _style(18, FontWeight.w600);
  TextStyle get p => _style(16);
  TextStyle get lead => _style(20);
  TextStyle get textLarge => _style(20, FontWeight.w600);
  TextStyle get textSmall => _style(14, FontWeight.w500);
  TextStyle get textMuted => _style(14);

  /// Small uppercase-free label used by badges, captions and chips.
  TextStyle get label => _style(12, FontWeight.w600);

  // Weight modifiers, for `style.merge(typography.semiBold)`.
  TextStyle get normal => const TextStyle(fontWeight: FontWeight.w400);
  TextStyle get medium => const TextStyle(fontWeight: FontWeight.w500);
  TextStyle get semiBold => const TextStyle(fontWeight: FontWeight.w600);
  TextStyle get bold => const TextStyle(fontWeight: FontWeight.w700);
}
