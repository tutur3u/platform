import 'package:flutter/material.dart';

class AppCardPalette {
  const AppCardPalette({
    required this.background,
    required this.border,
    required this.shadow,
    required this.iconBackground,
    required this.iconColor,
    required this.textColor,
  });

  factory AppCardPalette.resolve(
    BuildContext context, {
    required int index,
    String? moduleId,
  }) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final mapped = _paletteForModule(moduleId, isDark: isDark);
    if (mapped != null) {
      return mapped;
    }

    final palettes = isDark
        ? const [
            AppCardPalette(
              background: Color(0xFF232832),
              border: Color(0xFF556277),
              shadow: Color(0x22131720),
              iconBackground: Color(0xFF2E3644),
              iconColor: Color(0xFFD9E5F8),
              textColor: Color(0xFFF2F6FF),
            ),
            AppCardPalette(
              background: Color(0xFF2A241D),
              border: Color(0xFF8E7350),
              shadow: Color(0x2218130D),
              iconBackground: Color(0xFF382F24),
              iconColor: Color(0xFFF4E0BE),
              textColor: Color(0xFFFFF3E1),
            ),
          ]
        : const [
            AppCardPalette(
              background: Color(0xFFEAF1FF),
              border: Color(0xFFC5D4F4),
              shadow: Color(0x334E78B8),
              iconBackground: Color(0xFFFFFFFF),
              iconColor: Color(0xFF325E9C),
              textColor: Color(0xFF192C4B),
            ),
            AppCardPalette(
              background: Color(0xFFFFF1E1),
              border: Color(0xFFE6CAA7),
              shadow: Color(0x33B87A31),
              iconBackground: Color(0xFFFFFFFF),
              iconColor: Color(0xFF93602A),
              textColor: Color(0xFF452A0E),
            ),
          ];

    return palettes[index % palettes.length];
  }

  final Color background;
  final Color border;
  final Color shadow;
  final Color iconBackground;
  final Color iconColor;
  final Color textColor;
}

AppCardPalette? _paletteForModule(String? moduleId, {required bool isDark}) {
  switch (moduleId) {
    case 'tasks':
      return isDark
          ? const AppCardPalette(
              background: Color(0xFF241D34),
              border: Color(0xFF6950A7),
              shadow: Color(0x22160F21),
              iconBackground: Color(0xFF33264A),
              iconColor: Color(0xFFE6D9FF),
              textColor: Color(0xFFF6F0FF),
            )
          : const AppCardPalette(
              background: Color(0xFFF2E7FF),
              border: Color(0xFFD2B9F4),
              shadow: Color(0x336E42B7),
              iconBackground: Color(0xFFFFFFFF),
              iconColor: Color(0xFF5E38A0),
              textColor: Color(0xFF2A184B),
            );
    case 'calendar':
      return isDark
          ? const AppCardPalette(
              background: Color(0xFF1C2C37),
              border: Color(0xFF4D80A5),
              shadow: Color(0x22111A21),
              iconBackground: Color(0xFF274053),
              iconColor: Color(0xFFDCEEFF),
              textColor: Color(0xFFEDF7FF),
            )
          : const AppCardPalette(
              background: Color(0xFFE7F6FF),
              border: Color(0xFFBDDDF2),
              shadow: Color(0x334E96C8),
              iconBackground: Color(0xFFFFFFFF),
              iconColor: Color(0xFF2D678E),
              textColor: Color(0xFF163347),
            );
    case 'finance':
      return isDark
          ? const AppCardPalette(
              background: Color(0xFF302414),
              border: Color(0xFFA37031),
              shadow: Color(0x221A130B),
              iconBackground: Color(0xFF44301B),
              iconColor: Color(0xFFFFE4BE),
              textColor: Color(0xFFFFF3E2),
            )
          : const AppCardPalette(
              background: Color(0xFFFFF0DA),
              border: Color(0xFFE8CA93),
              shadow: Color(0x33CA8B2F),
              iconBackground: Color(0xFFFFFFFF),
              iconColor: Color(0xFF94601E),
              textColor: Color(0xFF48290A),
            );
    case 'timer':
      return isDark
          ? const AppCardPalette(
              background: Color(0xFF341C2E),
              border: Color(0xFFB15C97),
              shadow: Color(0x22200F1B),
              iconBackground: Color(0xFF4A2740),
              iconColor: Color(0xFFFFD8F2),
              textColor: Color(0xFFFFEDF9),
            )
          : const AppCardPalette(
              background: Color(0xFFFFE3F3),
              border: Color(0xFFF3B2D8),
              shadow: Color(0x33E48AC0),
              iconBackground: Color(0xFFFFFFFF),
              iconColor: Color(0xFFB23B82),
              textColor: Color(0xFF4E173A),
            );
    case 'drive':
      return isDark
          ? const AppCardPalette(
              background: Color(0xFF1B3225),
              border: Color(0xFF4B8C67),
              shadow: Color(0x22101813),
              iconBackground: Color(0xFF274333),
              iconColor: Color(0xFFD8F7E4),
              textColor: Color(0xFFEAF9F0),
            )
          : const AppCardPalette(
              background: Color(0xFFE5F7EC),
              border: Color(0xFFB8DFC7),
              shadow: Color(0x333AA36A),
              iconBackground: Color(0xFFFFFFFF),
              iconColor: Color(0xFF236B46),
              textColor: Color(0xFF163221),
            );
    case 'education':
      return isDark
          ? const AppCardPalette(
              background: Color(0xFF1C2A3B),
              border: Color(0xFF4D79B7),
              shadow: Color(0x2210181F),
              iconBackground: Color(0xFF283C56),
              iconColor: Color(0xFFDCE9FF),
              textColor: Color(0xFFEEF5FF),
            )
          : const AppCardPalette(
              background: Color(0xFFE8F1FF),
              border: Color(0xFFBDD2F2),
              shadow: Color(0x33597ECF),
              iconBackground: Color(0xFFFFFFFF),
              iconColor: Color(0xFF2D5FA8),
              textColor: Color(0xFF183250),
            );
    case 'inventory':
      return isDark
          ? const AppCardPalette(
              background: Color(0xFF27301A),
              border: Color(0xFF7B9550),
              shadow: Color(0x22161B10),
              iconBackground: Color(0xFF354127),
              iconColor: Color(0xFFE6F1D3),
              textColor: Color(0xFFF5FAEC),
            )
          : const AppCardPalette(
              background: Color(0xFFF0F7E3),
              border: Color(0xFFD0DFB0),
              shadow: Color(0x33849E45),
              iconBackground: Color(0xFFFFFFFF),
              iconColor: Color(0xFF5E7B22),
              textColor: Color(0xFF29380E),
            );
    case 'crm':
      return isDark
          ? const AppCardPalette(
              background: Color(0xFF2C1D2C),
              border: Color(0xFF9E5F9A),
              shadow: Color(0x22180F18),
              iconBackground: Color(0xFF3B2640),
              iconColor: Color(0xFFF7D9F0),
              textColor: Color(0xFFFFEFFA),
            )
          : const AppCardPalette(
              background: Color(0xFFFFE8F7),
              border: Color(0xFFE6B9DA),
              shadow: Color(0x33C765A8),
              iconBackground: Color(0xFFFFFFFF),
              iconColor: Color(0xFFA43D84),
              textColor: Color(0xFF481536),
            );
    case 'habits':
      return isDark
          ? const AppCardPalette(
              background: Color(0xFF2E1E1A),
              border: Color(0xFFB46D45),
              shadow: Color(0x22190F0B),
              iconBackground: Color(0xFF442A22),
              iconColor: Color(0xFFFFD8BE),
              textColor: Color(0xFFFFF0E6),
            )
          : const AppCardPalette(
              background: Color(0xFFFFE8D8),
              border: Color(0xFFF2B58A),
              shadow: Color(0x33F29A58),
              iconBackground: Color(0xFFFFFFFF),
              iconColor: Color(0xFF9A4F1F),
              textColor: Color(0xFF4C240B),
            );
    case 'notifications':
      return isDark
          ? const AppCardPalette(
              background: Color(0xFF30241C),
              border: Color(0xFFAE7F48),
              shadow: Color(0x2219120B),
              iconBackground: Color(0xFF433123),
              iconColor: Color(0xFFFFE3C1),
              textColor: Color(0xFFFFF4E6),
            )
          : const AppCardPalette(
              background: Color(0xFFFFF0DE),
              border: Color(0xFFEFD0AA),
              shadow: Color(0x33D38E3D),
              iconBackground: Color(0xFFFFFFFF),
              iconColor: Color(0xFF985D17),
              textColor: Color(0xFF492A08),
            );
    case 'settings':
      return isDark
          ? const AppCardPalette(
              background: Color(0xFF242730),
              border: Color(0xFF646C80),
              shadow: Color(0x2212161D),
              iconBackground: Color(0xFF303543),
              iconColor: Color(0xFFE2E8F6),
              textColor: Color(0xFFF3F6FF),
            )
          : const AppCardPalette(
              background: Color(0xFFEEF2F8),
              border: Color(0xFFCAD3E2),
              shadow: Color(0x335D7194),
              iconBackground: Color(0xFFFFFFFF),
              iconColor: Color(0xFF445A7E),
              textColor: Color(0xFF1D2940),
            );
    default:
      return null;
  }
}
