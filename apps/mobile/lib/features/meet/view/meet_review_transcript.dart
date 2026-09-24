import 'package:flutter/material.dart';
import 'package:mobile/l10n/l10n.dart';

class MeetReviewTranscript extends StatelessWidget {
  const MeetReviewTranscript({required this.chunks, super.key});

  final List<Map<String, dynamic>> chunks;

  static String? _text(Object? value) {
    final text = value?.toString().trim();
    return text == null || text.isEmpty ? null : text;
  }

  static Map<String, dynamic>? _map(Object? value) =>
      value is Map<String, dynamic> ? value : null;

  static String _timestamp(Object? value) {
    final seconds = value is num ? value.toInt().clamp(0, 359999) : 0;
    final hours = seconds ~/ 3600;
    final minutes = (seconds ~/ 60) % 60;
    final remainder = seconds % 60;
    final paddedSeconds = remainder.toString().padLeft(2, '0');
    if (hours > 0) {
      final paddedMinutes = minutes.toString().padLeft(2, '0');
      return '$hours:$paddedMinutes:$paddedSeconds';
    }
    return '$minutes:$paddedSeconds';
  }

  Iterable<Map<String, dynamic>> get _entries sync* {
    for (final chunk in chunks) {
      final segments = chunk['segments'];
      if (segments is List && segments.isNotEmpty) {
        var included = false;
        for (final segment in segments.whereType<Map<String, dynamic>>()) {
          if (_text(segment['transcript']) != null) {
            included = true;
            yield segment;
          }
        }
        if (!included && _text(chunk['transcript']) != null) yield chunk;
      } else if (_text(chunk['transcript']) != null) {
        yield chunk;
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colorScheme = Theme.of(context).colorScheme;
    final entries = _entries.toList(growable: false);
    if (entries.isEmpty) return Text(l10n.meetReviewNoTranscript);

    return Column(
      children: [
        for (final entry in entries)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: colorScheme.surfaceContainerLow,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: colorScheme.outlineVariant),
              ),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            _text(_map(entry['speaker'])?['displayName']) ??
                                l10n.meetReviewUnknownSpeaker,
                            style: TextStyle(
                              color: colorScheme.primary,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        Text(
                          _timestamp(entry['startSeconds']),
                          style: Theme.of(context).textTheme.labelSmall,
                        ),
                      ],
                    ),
                    if (entry['kind'] ?? _map(entry['speaker'])?['kind']
                        case final String kind) ...[
                      const SizedBox(height: 2),
                      Text(
                        kind == 'shared_audio'
                            ? l10n.meetReviewSharedAudio
                            : l10n.meetReviewMicrophone,
                        style: Theme.of(context).textTheme.labelSmall,
                      ),
                    ],
                    const SizedBox(height: 7),
                    SelectableText(_text(entry['transcript'])!),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }
}
