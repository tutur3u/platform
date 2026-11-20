part of 'drive_page.dart';

/// A Drive file opened over the file list. The shell's top bar shows the
/// file name and the dock's Back closes the preview, so the page draws no bar
/// of its own.
class DrivePreviewPage extends StatelessWidget {
  const DrivePreviewPage({
    required this.title,
    required this.signedUrl,
    super.key,
  });

  final String title;
  final String signedUrl;

  /// Replaces the web view that renders a signed URL, which has no
  /// platform view in widget tests.
  @visibleForTesting
  static Widget Function(String signedUrl)? viewerForTesting;

  @override
  Widget build(BuildContext context) {
    // The preview covers the Drive location without changing it.
    final location = GoRouter.maybeOf(context)?.state.uri.path;
    return Stack(
      fit: StackFit.expand,
      children: [
        // The file ends above the floating dock, which would cover it.
        Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.paddingOf(context).bottom,
          ),
          child:
              viewerForTesting?.call(signedUrl) ??
              InAppWebView(
                initialUrlRequest: URLRequest(url: WebUri(signedUrl)),
              ),
        ),
        if (location != null) ...[
          ShellTitleOverride(
            ownerId: 'drive-preview',
            locations: {location},
            title: title,
            showLeadingBrand: false,
          ),
          ShellChromeActions(
            ownerId: 'drive-preview',
            locations: {location},
            // Only the current preview closes; a Back while it closes must
            // not pop the list beneath. The registration retires with it.
            onBack: () async {
              if (ModalRoute.isCurrentOf(context) ?? false) {
                Navigator.of(context).pop();
              }
            },
          ),
        ],
      ],
    );
  }
}

String _formatBytes(int bytes) {
  if (bytes <= 0) return '0 B';
  const suffixes = ['B', 'KB', 'MB', 'GB', 'TB'];
  var value = bytes.toDouble();
  var index = 0;
  while (value >= 1024 && index < suffixes.length - 1) {
    value /= 1024;
    index += 1;
  }
  return '${value.toStringAsFixed(index == 0 ? 0 : 1)} ${suffixes[index]}';
}

String _formatDate(String? value) {
  if (value == null) return '';
  final parsed = DateTime.tryParse(value);
  if (parsed == null) return '';
  return DateFormat.yMMMd().add_Hm().format(parsed.toLocal());
}

class _DriveNameField extends StatefulWidget {
  const _DriveNameField({
    required this.initialName,
    required this.onChanged,
    required this.placeholder,
  });

  final String initialName;
  final ValueChanged<String> onChanged;
  final String placeholder;

  @override
  State<_DriveNameField> createState() => _DriveNameFieldState();
}

class _DriveNameFieldState extends State<_DriveNameField> {
  late final TextEditingController _controller = TextEditingController(
    text: widget.initialName,
  );

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AppTextField(
    controller: _controller,
    autofocus: true,
    placeholder: widget.placeholder,
    onChanged: widget.onChanged,
  );
}
