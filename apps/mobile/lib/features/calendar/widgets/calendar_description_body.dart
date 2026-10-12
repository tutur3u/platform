import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:mobile/core/router/mobile_link_launcher.dart';
import 'package:mobile/features/calendar/utils/calendar_description_content.dart';

/// Native read-only formatting. Images remain text; no HTML/WebView executes.
class CalendarDescriptionBody extends StatelessWidget {
  const CalendarDescriptionBody({required this.description, super.key});

  final String description;

  @override
  Widget build(BuildContext context) => MarkdownBody(
    data: calendarDescriptionMarkdown(description),
    selectable: true,
    softLineBreak: true,
    styleSheet: MarkdownStyleSheet.fromTheme(Theme.of(context)),
    imageBuilder: (uri, title, alt) => Text(alt ?? ''),
    onTapLink: (text, href, title) {
      final uri = href == null ? null : calendarDescriptionLink(href);
      if (uri != null) unawaited(openMobileLink(context, uri));
    },
  );
}
