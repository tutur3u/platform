import 'package:mobile/core/theme/appearance/brand_accents.dart';

/// `#RRGGBB` for a brand mark. Tag records store this string; the editor
/// paints [BrandAccent.fill], not the hex.
String contactBrandMarkHex(BrandAccent accent) {
  final rgb = accent.mark.toARGB32() & 0xFFFFFF;
  return '#${rgb.toRadixString(16).padLeft(6, '0').toUpperCase()}';
}

/// The core brand mark stored in [stored], when it is one of the four logo
/// colours. Other stored values stay unmatched so an edit can keep them.
BrandAccent? contactBrandAccentForHex(String? stored) {
  if (stored == null) return null;
  final trimmed = stored.trim().toUpperCase();
  final hex = trimmed.startsWith('#') ? trimmed : '#$trimmed';
  for (final accent in BrandAccents.core) {
    if (contactBrandMarkHex(accent) == hex) return accent;
  }
  return null;
}
