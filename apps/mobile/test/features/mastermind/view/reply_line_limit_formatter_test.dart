import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/replies/reply_models.dart';
import 'package:mobile/features/mastermind/view/inbox/reply_composer.dart';

TextEditingValue _value(String text, {int? caret}) => TextEditingValue(
  text: text,
  selection: TextSelection.collapsed(offset: caret ?? text.length),
);

String _lines(int count, [String separator = '\n']) =>
    List.filled(count, 'x').join(separator);

void main() {
  const formatter = LineLimitFormatter(mastermindReplyLineLimit);

  test('an edit within the limit passes through untouched', () {
    final old = _value(_lines(9));
    final next = _value(_lines(10));
    expect(formatter.formatEditUpdate(old, next), same(next));
  });

  test('surplus lines typed or pasted at the end are dropped', () {
    final old = _value(_lines(9));
    final next = _value('${_lines(9)}\nextra\nmore');
    final result = formatter.formatEditUpdate(old, next);
    expect(result.text, '${_lines(9)}\nextra');
    expect(
      result.selection,
      TextSelection.collapsed(offset: result.text.length),
    );
  });

  test('CRLF and lone CR count as one line break each', () {
    final old = _value(_lines(10, '\r\n'));
    expect(formatter.formatEditUpdate(old, old), same(old));

    final crlf = _value(_lines(11, '\r\n'));
    expect(formatter.formatEditUpdate(old, crlf).text, _lines(10));
    final cr = _value(_lines(11, '\r'));
    expect(formatter.formatEditUpdate(old, cr).text, _lines(10));
  });

  test('an edit in the middle that overflows is refused, not trimmed', () {
    final old = _value(_lines(10), caret: 1);
    // A line break inserted after the first character pushes an 11th line in.
    final next = _value('x\n${_lines(10).substring(1)}', caret: 2);
    expect(next.text.split('\n'), hasLength(11));
    expect(formatter.formatEditUpdate(old, next), same(old));
  });

  test('a paste in the middle that overflows is refused too', () {
    final old = _value(_lines(10), caret: 3);
    final next = _value(
      '${_lines(10).substring(0, 3)}\n\n\n${_lines(10).substring(3)}',
      caret: 6,
    );
    expect(formatter.formatEditUpdate(old, next), same(old));
  });
}
