import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/router/mobile_link_launcher.dart';

class AssistantSourceLink extends StatelessWidget {
  const AssistantSourceLink({required this.url, this.title, super.key});

  final String url;
  final String? title;

  @override
  Widget build(BuildContext context) {
    final uri = Uri.tryParse(url);
    if (uri == null ||
        !{'http', 'https'}.contains(uri.scheme.toLowerCase()) ||
        uri.host.isEmpty ||
        uri.userInfo.isNotEmpty) {
      return const SizedBox.shrink();
    }
    return Align(
      alignment: Alignment.centerLeft,
      child: TextButton.icon(
        onPressed: () => unawaited(openMobileLink(context, uri)),
        icon: const Icon(Icons.link_rounded, size: 16),
        label: Text(
          title?.trim().isNotEmpty == true ? title! : uri.host,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
      ),
    );
  }
}
