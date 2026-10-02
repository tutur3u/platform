import 'package:flutter/material.dart';
import 'package:mobile/features/shell/view/readable_shell_title.dart';

/// Shared brand geometry and typography for normal and fullscreen headers.
class ShellBrandTitle extends StatelessWidget {
  const ShellBrandTitle({required this.title, super.key});
  final String title;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Image.asset('assets/logos/transparent.png', width: 28, height: 28),
        const SizedBox(width: 10),
        Flexible(
          child: ReadableShellTitle(
            title,
            style: Theme.of(
              context,
            ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
          ),
        ),
      ],
    ),
  );
}
