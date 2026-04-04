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
    if (moduleId == 'habits') {
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
    }

    if (moduleId == 'timer') {
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
    }

    final palettes = isDark
        ? const [
            AppCardPalette(
              background: Color(0xFF231C31),
              border: Color(0xFF5D4A8A),
              shadow: Color(0x22130E1C),
              iconBackground: Color(0xFF33264A),
              iconColor: Color(0xFFE4D6FF),
              textColor: Color(0xFFF4EEFF),
            ),
            AppCardPalette(
              background: Color(0xFF1B2A35),
              border: Color(0xFF44749A),
              shadow: Color(0x2210181F),
              iconBackground: Color(0xFF233F52),
              iconColor: Color(0xFFD8EDFF),
              textColor: Color(0xFFE9F5FF),
            ),
            AppCardPalette(
              background: Color(0xFF2E2418),
              border: Color(0xFF9C6B38),
              shadow: Color(0x221A120B),
              iconBackground: Color(0xFF41301F),
              iconColor: Color(0xFFFFE1C0),
              textColor: Color(0xFFFFF1E1),
            ),
            AppCardPalette(
              background: Color(0xFF1C2E24),
              border: Color(0xFF4B8763),
              shadow: Color(0x22101813),
              iconBackground: Color(0xFF274132),
              iconColor: Color(0xFFD8F4E2),
              textColor: Color(0xFFEAF8EE),
            ),
          ]
        : const [
            AppCardPalette(
              background: Color(0xFFF4E7FF),
              border: Color(0xFFD9BFF8),
              shadow: Color(0x33D9BFF8),
              iconBackground: Color(0xFFFFFFFF),
              iconColor: Color(0xFF5E3AA8),
              textColor: Color(0xFF271542),
            ),
            AppCardPalette(
              background: Color(0xFFE8F6FF),
              border: Color(0xFFBDDFF7),
              shadow: Color(0x332FA3E8),
              iconBackground: Color(0xFFFFFFFF),
              iconColor: Color(0xFF1F5F8B),
              textColor: Color(0xFF173042),
            ),
            AppCardPalette(
              background: Color(0xFFFFF1DD),
              border: Color(0xFFF0D2A4),
              shadow: Color(0x33F0A24B),
              iconBackground: Color(0xFFFFFFFF),
              iconColor: Color(0xFF8D4E18),
              textColor: Color(0xFF42240A),
            ),
            AppCardPalette(
              background: Color(0xFFE5F7EC),
              border: Color(0xFFB7DFC7),
              shadow: Color(0x333DA56D),
              iconBackground: Color(0xFFFFFFFF),
              iconColor: Color(0xFF256946),
              textColor: Color(0xFF163121),
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
