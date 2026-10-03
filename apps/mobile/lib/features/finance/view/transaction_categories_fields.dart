part of 'transaction_categories_page.dart';

class _TaxonomyTextField extends StatelessWidget {
  const _TaxonomyTextField({
    required this.controller,
    required this.placeholder,
    required this.onChanged,
    this.autofocus = false,
    this.errorText,
  });

  final TextEditingController controller;
  final String placeholder;
  final ValueChanged<String> onChanged;
  final bool autofocus;
  final String? errorText;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        shad.TextField(
          contextMenuBuilder: platformTextContextMenuBuilder(),
          controller: controller,
          placeholder: Text(placeholder),
          autofocus: autofocus,
          onChanged: onChanged,
        ),
        if (errorText != null) ...[
          const shad.Gap(4),
          _TaxonomyFieldErrorText(message: errorText!),
        ],
      ],
    );
  }
}

class _TaxonomyTextArea extends StatelessWidget {
  const _TaxonomyTextArea({
    required this.controller,
    required this.placeholder,
    required this.onChanged,
  });

  final TextEditingController controller;
  final String placeholder;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return shad.TextArea(
      contextMenuBuilder: platformTextContextMenuBuilder(),
      controller: controller,
      placeholder: Text(placeholder),
      initialHeight: 96,
      minHeight: 96,
      maxHeight: 156,
      onChanged: onChanged,
    );
  }
}

class _TaxonomyFieldErrorText extends StatelessWidget {
  const _TaxonomyFieldErrorText({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Text(
      message,
      style: shad.Theme.of(context).typography.xSmall.copyWith(
        color: shad.Theme.of(context).colorScheme.destructive,
        fontWeight: FontWeight.w600,
      ),
    );
  }
}
