import 'package:flutter/material.dart';
import 'package:mobile/l10n/l10n.dart';

class MeetMediaStatusBanner extends StatelessWidget {
  const MeetMediaStatusBanner({
    required this.onRetry,
    this.failureStage,
    super.key,
  });

  final VoidCallback onRetry;
  final String? failureStage;

  String _message(BuildContext context) => switch (failureStage) {
    'capture' => context.l10n.meetMediaCaptureFailed,
    'send' => context.l10n.meetMediaSendFailed,
    'session' => context.l10n.meetMediaSessionFailed,
    'publish' => context.l10n.meetMediaPublishFailed,
    'receive' => context.l10n.meetMediaReceiveFailed,
    'connect' => context.l10n.meetMediaConnectFailed,
    _ => context.l10n.meetMediaUnavailable,
  };

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
                  _message(context),
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
