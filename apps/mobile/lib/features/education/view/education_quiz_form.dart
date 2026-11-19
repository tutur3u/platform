part of 'education_page.dart';

class _QuizSheet extends StatefulWidget {
  const _QuizSheet({
    required this.title,
    required this.onSubmit,
    this.initialQuiz,
  });

  final String title;
  final EducationQuiz? initialQuiz;
  final Future<void> Function(
    String question,
    List<Map<String, dynamic>> options,
  )
  onSubmit;

  @override
  State<_QuizSheet> createState() => _QuizSheetState();
}

class _QuizSheetState extends State<_QuizSheet> {
  late final TextEditingController _questionController;
  late List<_QuizOptionDraft> _options;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _questionController = TextEditingController(
      text: widget.initialQuiz?.question,
    );
    _options = (widget.initialQuiz?.options ?? const <EducationQuizOption>[])
        .map(_QuizOptionDraft.fromOption)
        .toList(growable: true);
    if (_options.length < 2) {
      _options = [
        _QuizOptionDraft.empty(correct: true),
        _QuizOptionDraft.empty(),
      ];
    }
  }

  @override
  void dispose() {
    _questionController.dispose();
    for (final option in _options) {
      option.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    final question = _questionController.text.trim();
    if (question.isEmpty) return;
    final cleanedOptions = _options
        .map(
          (option) => {
            if (option.id?.isNotEmpty ?? false) 'id': option.id,
            'value': option.controller.text.trim(),
            'is_correct': option.isCorrect,
            'explanation': option.explanationController.text.trim().isEmpty
                ? null
                : option.explanationController.text.trim(),
          },
        )
        .where((option) => option['value']?.toString().isNotEmpty ?? false)
        .toList(growable: false);

    if (cleanedOptions.length < 2 ||
        !cleanedOptions.any((option) => option['is_correct'] == true)) {
      return;
    }

    setState(() => _submitting = true);
    try {
      await widget.onSubmit(question, cleanedOptions);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on Object catch (error) {
      if (mounted) {
        setState(
          () => _error = error is ApiException
              ? error.message
              : context.l10n.commonSomethingWentWrong,
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppSheetScaffold(
      title: widget.title,
      actions: [
        AppButton.ghost(
          onPressed: _submitting
              ? null
              : () => Navigator.of(context).pop(false),
          child: Text(l10n.commonCancel),
        ),
        AppButton.primary(
          onPressed: _submitting ? null : _submit,
          loading: _submitting,
          child: Text(l10n.commonSave),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_error != null) ...[
            AppAlert.destructive(content: Text(_error!)),
            const SizedBox(height: AppSpacing.md),
          ],
          AppTextField(
            controller: _questionController,
            label: l10n.educationQuizQuestionLabel,
            placeholder: l10n.inputPlaceholderQuizQuestion,
            minLines: 2,
            maxLines: 4,
          ),
          const SizedBox(height: AppSpacing.md),
          for (var index = 0; index < _options.length; index++)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.md),
              child: _QuizOptionEditor(
                index: index,
                option: _options[index],
                canRemove: _options.length > 2,
                onCorrectChanged: (value) {
                  setState(() => _options[index].isCorrect = value);
                },
                onRemove: () {
                  setState(() => _options.removeAt(index).dispose());
                },
              ),
            ),
          AppButton.ghost(
            leading: const Icon(LucideIcons.plus),
            onPressed: () {
              setState(() => _options.add(_QuizOptionDraft.empty()));
            },
            child: Text(l10n.educationAddOption),
          ),
        ],
      ),
    );
  }
}

class _QuizOptionEditor extends StatelessWidget {
  const _QuizOptionEditor({
    required this.index,
    required this.option,
    required this.canRemove,
    required this.onCorrectChanged,
    required this.onRemove,
  });

  final int index;
  final _QuizOptionDraft option;
  final bool canRemove;
  final ValueChanged<bool> onCorrectChanged;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  l10n.educationQuizOptionLabel(index + 1),
                  style: AppTokens.of(
                    context,
                  ).typography.small.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              AppSwitch(
                value: option.isCorrect,
                semanticLabel: l10n.educationQuizCorrect,
                onChanged: onCorrectChanged,
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          AppTextField(
            controller: option.controller,
            label: l10n.educationQuizOptionValueLabel,
            placeholder: l10n.inputPlaceholderQuizOption,
          ),
          const SizedBox(height: AppSpacing.sm),
          AppTextField(
            controller: option.explanationController,
            label: l10n.educationQuizOptionExplanationLabel,
            placeholder: l10n.inputPlaceholderQuizExplanation,
          ),
          if (canRemove)
            Align(
              alignment: AlignmentDirectional.centerEnd,
              child: AppButton.ghost(
                onPressed: onRemove,
                child: Text(l10n.commonDelete),
              ),
            ),
        ],
      ),
    );
  }
}
