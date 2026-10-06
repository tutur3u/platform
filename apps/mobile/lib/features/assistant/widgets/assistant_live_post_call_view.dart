import 'package:flutter/material.dart';
import 'package:mobile/l10n/l10n.dart';

/// Ending a call keeps Live selected. Calling again remains an explicit action.
class AssistantLivePostCallView extends StatefulWidget {
  const AssistantLivePostCallView({
    required this.onCall,
    required this.transcript,
    super.key,
  });

  final Future<void> Function() onCall;
  final Widget transcript;

  @override
  State<AssistantLivePostCallView> createState() => _PostCallState();
}

class _PostCallState extends State<AssistantLivePostCallView> {
  bool _showTranscript = false;
  bool _starting = false;

  Future<void> _call() async {
    if (_starting) return;
    setState(() => _starting = true);
    try {
      await widget.onCall();
    } finally {
      if (mounted) setState(() => _starting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final actions = Wrap(
      alignment: WrapAlignment.center,
      spacing: 12,
      runSpacing: 12,
      children: [
        FilledButton.icon(
          onPressed: _starting ? null : _call,
          icon: const Icon(Icons.call_rounded),
          label: Text(context.l10n.assistantLiveCallAgain),
        ),
        OutlinedButton.icon(
          onPressed: () => setState(() => _showTranscript = !_showTranscript),
          icon: Icon(
            _showTranscript ? Icons.close_rounded : Icons.subject_rounded,
          ),
          label: Text(context.l10n.assistantLiveViewTranscript),
        ),
      ],
    );
    if (_showTranscript) {
      return Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            actions,
            const SizedBox(height: 16),
            Expanded(child: widget.transcript),
          ],
        ),
      );
    }
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              context.l10n.assistantLiveCallEnded,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 24),
            actions,
          ],
        ),
      ),
    );
  }
}
