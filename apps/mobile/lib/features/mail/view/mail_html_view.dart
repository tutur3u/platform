import 'package:flutter/material.dart';
import 'package:mobile/features/mail/view/mail_html_body.dart';
import 'package:mobile/l10n/l10n.dart';

class MailHtmlView extends StatelessWidget {
  const MailHtmlView({
    required this.html,
    this.inlineImages = const {},
    super.key,
  });

  final String html;
  final Map<String, String> inlineImages;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(context.l10n.mailViewOriginal)),
    body: MailHtmlBody(html: html, inlineImages: inlineImages, embedded: false),
  );
}
