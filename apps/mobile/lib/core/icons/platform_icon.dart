import 'package:flutter/widgets.dart';
import 'package:mobile/core/icons/platform_icon_data.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class PlatformIconOption {
  const PlatformIconOption({
    required this.key,
    required this.label,
    required this.icon,
  });

  final String key;
  final String label;
  final IconData icon;
}

final List<PlatformIconOption> platformIconOptions = platformIconKeys
    .map((key) {
      final icon = resolvePlatformIconData(key);
      if (icon == null) {
        return null;
      }

      return PlatformIconOption(
        key: key,
        label: _humanizePlatformIconKey(key),
        icon: icon,
      );
    })
    .whereType<PlatformIconOption>()
    .toList(growable: false);

IconData resolvePlatformIcon(String? key, {IconData? fallback}) {
  return resolvePlatformIconData(key) ?? fallback ?? shad.LucideIcons.circle;
}

String _humanizePlatformIconKey(String key) {
  final spaced = key.replaceAllMapped(
    RegExp('(?<!^)([A-Z])'),
    (match) => ' ${match.group(1)}',
  );
  return spaced.replaceAll(RegExp(r'\s+'), ' ').trim();
}
