import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_appearance_control.dart';
import 'package:mobile/features/mail/view/mail_html_document.dart';
import 'package:mobile/features/mail/view/mail_inline_images.dart';

/// A message's HTML body with inline attachment references rewritten, or an
/// empty string for a plain-text message.
String mailMessageHtml(Map<String, dynamic> message) =>
    rewriteMailInlineAttachmentUrls(
      message['bodyHtml'] as String? ??
          message['sanitizedHtml'] as String? ??
          '',
      mailAttachmentContentIds(mailRows(message['attachments'])),
    );

/// The render request for [html] under the current theme. The reader body
/// and the pre-render before an open build the same request, so the open
/// finds the document the warm-up produced.
MailDocumentRequest mailDocumentRequest(
  BuildContext context, {
  required String html,
  required bool loadImages,
  Map<String, String> inlineImages = const {},
  MailMessageAppearance? appearance,
}) {
  final effective = appearance ?? mailEffectiveAppearance(context);
  return MailDocumentRequest(
    html: html,
    loadImages: loadImages,
    inlineImages: inlineImages,
    appearance: effective,
    // The page colour applies only when the message theme matches the app's.
    backgroundArgb:
        (effective == MailMessageAppearance.dark) ==
            (Theme.of(context).brightness == Brightness.dark)
        ? AppTokens.of(context).colorScheme.background.toARGB32()
        : null,
  );
}
