import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Every text input in the app shows placeholder text while it is empty.
///
/// This is a lexical scan of `lib/`: each input constructor call must pass a
/// `placeholder:`, `hintText:` or `hint:` argument. Calls that genuinely have
/// no free-text placeholder (for example, single-digit OTP cells) carry an
/// `// input-placeholder: exempt <reason>` comment inside the argument list.
final _inputCall = RegExp(
  r'(?<![A-Za-z0-9_.])(shad\.TextField|shad\.TextArea|TextField|TextFormField|'
  r'CupertinoTextField|AppTextField|AppTextFormField|AppSearchField)\(',
);
final _hintArgument = RegExp(r'\b(placeholder|hintText|hint)\s*:');
const _exemptMarker = 'input-placeholder: exempt';

/// Returns `file:line:Constructor` for input calls without a placeholder.
List<String> findInputsWithoutPlaceholder(String path, String source) {
  final missing = <String>[];
  for (final match in _inputCall.allMatches(source)) {
    final before = source.substring(0, match.start);
    final lineStart = before.lastIndexOf('\n') + 1;
    final linePrefix = before.substring(lineStart);
    // Skip constructor declarations such as `const AppTextField({`.
    if (_isDeclaration(source, match.end)) continue;
    if (linePrefix.trimLeft().startsWith('//') ||
        linePrefix.trimLeft().startsWith('///')) {
      continue;
    }
    final arguments = _argumentList(source, match.end);
    if (_hintArgument.hasMatch(arguments) ||
        arguments.contains(_exemptMarker)) {
      continue;
    }
    final line = '\n'.allMatches(before).length + 1;
    missing.add('$path:$line:${match.group(1)}');
  }
  return missing;
}

bool _isDeclaration(String source, int argumentsStart) {
  final arguments = _argumentList(source, argumentsStart);
  return RegExp(r'\bthis\.\w+').hasMatch(arguments) &&
      RegExp(r'\bsuper\.key\b').hasMatch(arguments);
}

String _argumentList(String source, int start) {
  var depth = 1;
  var index = start;
  while (depth > 0 && index < source.length) {
    final char = source.codeUnitAt(index);
    if (char == 0x28) depth++;
    if (char == 0x29) depth--;
    index++;
  }
  return source.substring(start, index);
}

void main() {
  test('scanner flags inputs without a placeholder and honours exemptions', () {
    const source = '''
class AppTextField {
  const AppTextField({this.placeholder, super.key});
}
final a = TextField(decoration: InputDecoration(labelText: 'Name'));
final b = AppTextField(label: 'Name', placeholder: 'Ada Lovelace');
final c = TextFormField(
  // input-placeholder: exempt single OTP digit
  maxLength: 1,
);
final d = shad.TextArea(placeholder: Text('Notes'));
final e = AppTextFormField(label: 'Title');
''';
    expect(findInputsWithoutPlaceholder('x.dart', source), [
      'x.dart:4:TextField',
      'x.dart:11:AppTextFormField',
    ]);
  });

  test('every app text input has placeholder text', () {
    final missing = <String>[];
    final files = Directory('lib')
        .listSync(recursive: true)
        .whereType<File>()
        .where(
          (file) =>
              file.path.endsWith('.dart') &&
              !file.path.contains(
                '${Platform.pathSeparator}l10n'
                '${Platform.pathSeparator}',
              ),
        );
    for (final file in files) {
      missing.addAll(
        findInputsWithoutPlaceholder(file.path, file.readAsStringSync()),
      );
    }
    missing.sort();
    expect(
      missing,
      isEmpty,
      reason:
          'Add a localized placeholder (AppTextField.placeholder, '
          'InputDecoration.hintText or shad placeholder) to each input, or '
          'mark a deliberate exception with "// $_exemptMarker <reason>".',
    );
  });
}
