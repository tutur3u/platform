import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/view/mail_body_editor.dart';

void main() {
  test('preserves untouched draft HTML without fetching embedded images', () {
    final body = MailBodyController();
    addTearDown(body.dispose);
    const html =
        '<p>Hello <b>team</b></p><img src="https://example.com/pixel">';
    body.load('Hello team', html: html);
    expect(body.html, html);
    expect(
      body.quill.document.toDelta().toJson().every(
        (op) => op['insert'] is String,
      ),
      isTrue,
    );
    var changes = 0;
    body.addListener(() => changes++);
    body.quill.updateSelection(
      const TextSelection.collapsed(offset: 1),
      ChangeSource.local,
    );
    expect(body.html, html);
    expect(changes, 0);
  });

  test(
    'exports formatting and escapes authored text when the body changes',
    () {
      final body = MailBodyController();
      addTearDown(body.dispose);
      body.text = 'Hello <team>';
      body.quill.formatText(0, 5, Attribute.bold);
      expect(body.html, contains('<strong>Hello</strong>'));
      expect(body.html, contains('&lt;team&gt;'));
      expect(body.text, contains('Hello <team>'));
    },
  );
}
