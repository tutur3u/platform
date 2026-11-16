import 'package:flutter/widgets.dart';
import 'package:mobile/core/ui/tokens/app_type_scale.dart';

export 'package:mobile/core/ui/tokens/app_type_scale.dart';

/// Type scale of the mobile design system.
///
/// The size getters keep the legacy shadcn names and metrics in every design;
/// only their family follows the design's font. The role getters ([title],
/// [ui], [caption] and so on) carry each design's metrics from [scale], so
/// components read roles and never branch on the design. Styles carry no
/// colour; components apply `AppColorTokens` roles. Text scaling comes from
/// `MediaQuery.textScaler`, so never clamp it here.
@immutable
class AppTypography {
  const AppTypography({
    this.fontFamily = 'NotoSans',
    this.monoFamily,
    this.scale = AppTypeScale.classic,
  });

  /// Sans family, or null for the platform default.
  final String? fontFamily;

  /// Mono family for [overline] and [numeric], or null to use [fontFamily].
  final String? monoFamily;
  final AppTypeScale scale;

  TextStyle _style(double size, [FontWeight weight = FontWeight.w400]) =>
      TextStyle(fontFamily: fontFamily, fontSize: size, fontWeight: weight);

  TextStyle _role(AppTypeRole role) => TextStyle(
    fontFamily: role.mono ? monoFamily ?? fontFamily : fontFamily,
    fontSize: role.size,
    fontWeight: role.weight,
    height: role.lineHeight == null ? null : role.lineHeight! / role.size,
    letterSpacing: role.tracking == 0 ? null : role.tracking * role.size,
    fontFeatures: role.tabular ? const [FontFeature.tabularFigures()] : null,
  );

  // Size scale.
  TextStyle get xSmall => _style(12);
  TextStyle get small => _style(14);
  TextStyle get base => _style(16);
  TextStyle get large => _style(18);
  TextStyle get xLarge => _style(20);
  TextStyle get x2Large => _style(24);
  TextStyle get x3Large => _style(30);

  // Legacy roles.
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

  // Design roles; see [AppTypeScale] for where each one is used.
  TextStyle get display => _role(scale.display);
  TextStyle get title => _role(scale.title);
  TextStyle get heading => _role(scale.heading);
  TextStyle get bodyLg => _role(scale.bodyLg);
  TextStyle get body => _role(scale.body);
  TextStyle get bodySm => _role(scale.bodySm);
  TextStyle get ui => _role(scale.ui);
  TextStyle get uiSm => _role(scale.uiSm);
  TextStyle get uiCompact => _role(scale.uiCompact);
  TextStyle get caption => _role(scale.caption);
  TextStyle get overline => _role(scale.overline);
  TextStyle get numeric => _role(scale.numeric);

  // Weight modifiers, for `style.merge(typography.semiBold)`.
  TextStyle get normal => const TextStyle(fontWeight: FontWeight.w400);
  TextStyle get medium => const TextStyle(fontWeight: FontWeight.w500);
  TextStyle get semiBold => const TextStyle(fontWeight: FontWeight.w600);
  TextStyle get bold => const TextStyle(fontWeight: FontWeight.w700);

  @override
  bool operator ==(Object other) =>
      other is AppTypography &&
      other.fontFamily == fontFamily &&
      other.monoFamily == monoFamily &&
      identical(other.scale, scale);

  @override
  int get hashCode => Object.hash(fontFamily, monoFamily, scale);
}
