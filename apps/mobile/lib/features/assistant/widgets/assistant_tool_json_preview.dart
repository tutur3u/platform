import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/widgets/assistant_markdown_body.dart';

class AssistantToolJsonPreview extends StatelessWidget {
  const AssistantToolJsonPreview({required this.data, super.key});

  final dynamic data;

  @override
  Widget build(BuildContext context) {
    const encoder = JsonEncoder.withIndent('  ');
    final pretty = switch (data) {
      null => '{}',
      String() => data,
      _ => encoder.convert(data),
    };

    return AssistantMarkdownBody(data: '```json\n$pretty\n```', subdued: true);
  }
}
