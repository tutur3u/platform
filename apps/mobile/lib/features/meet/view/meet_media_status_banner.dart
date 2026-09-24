import 'package:flutter/material.dart';
import 'package:mobile/l10n/l10n.dart';

class MeetMediaStatusBanner extends StatelessWidget {
  const MeetMediaStatusBanner({required this.onRetry, super.key});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: scheme.errorContainer,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(
            children: [
              Icon(Icons.wifi_off, color: scheme.onErrorContainer),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  context.l10n.meetMediaUnavailable,
                  style: TextStyle(color: scheme.onErrorContainer),
                ),
              ),
              TextButton(
                onPressed: onRetry,
                child: Text(context.l10n.commonRetry),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
