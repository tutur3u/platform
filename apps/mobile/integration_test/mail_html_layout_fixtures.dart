/// Synthetic structural fixtures; these are not copies of vendor messages.
/// No private mailbox data, remote resources, fonts or analytics are included.
class MailHtmlLayoutFixture {
  const MailHtmlLayoutFixture(this.name, this.html);
  final String name;
  final String html;
}

// An opaque 112 by 20 dark brand mark with the displayed aspect ratio.
const mailLayoutLogoDataUri =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHAAAAAUCAYAAABVhbkHAAAAS0lEQVR4nO3RMQ0AMAzAsLIof6QbjCmaD/+RMrt76JrXARj4NQPjDIwzMM7AOAPjDIwzMM7AOAPjDIwzMM7AOAPjDIwzMM7AOAPjLt16E6aevKAVAAAAAElFTkSuQmCC';

const _logo =
    '<img id="brand-logo" src="cid:layout-logo" alt="Brand logo" '
    'width="112" height="20" style="display:block">';

String _copy(String heading) =>
    '''
<h1>$heading</h1>
<p id="message-copy" style="background-color:#e2f0ff">Your workspace update is ready to review. Confirm your
account details and continue with your team. This synthetic message checks
whether the reading column remains useful on a compact mobile display.</p>
<p>Reference: SAMPLE-2026-001. No payment or account action is required.</p>
''';

String _spacerTable(
  String heading, {
  bool nested = false,
  bool unspecifiedSpacers = false,
}) {
  final copy = _copy(heading);
  final spacerWidth = unspecifiedSpacers ? '' : ' width="24"';
  return '''
<table role="presentation" width="600" cellpadding="0" cellspacing="0">
<tr><td$spacerWidth>&nbsp;</td><td>
$_logo
${nested ? '<table width="552"><tr><td>$copy</td></tr></table>' : copy}
</td><td$spacerWidth>&nbsp;</td></tr></table>
''';
}

List<MailHtmlLayoutFixture> mailHtmlLayoutFixtures() => [
  MailHtmlLayoutFixture(
    'Stripe-like three-column spacers',
    _spacerTable('Review your workspace receipt', unspecifiedSpacers: true),
  ),
  MailHtmlLayoutFixture(
    'Link-like nested spacer tables',
    _spacerTable('Your account confirmation', nested: true),
  ),
  MailHtmlLayoutFixture('Vercel-like centered card', '''
<div style="width:600px;margin:auto;border:1px solid #ddd;padding:16px">
$_logo${_copy('Your deployment summary')}
<table width="568"><tr><td>Project</td><td>Sample workspace</td></tr></table>
</div>'''),
  MailHtmlLayoutFixture('Microsoft-like nested notification', '''
<table width="640" cellpadding="0"><tr><td style="padding:16px">
$_logo<table width="608"><tr><td>${_copy('Activity in your workspace')}</td></tr>
<tr><td style="background:#eee;padding:12px">One new team update</td></tr>
</table></td></tr></table>'''),
  MailHtmlLayoutFixture('Google-like security card', '''
<table width="600"><tr><td style="padding:12px">
$_logo<div style="border:1px solid #ddd;border-radius:8px;padding:12px">
${_copy('Review recent account activity')}
</div></td></tr></table>'''),
  MailHtmlLayoutFixture('Apple-like receipt columns', '''
<table width="600"><tr><td colspan="2">$_logo
${_copy('Your sample receipt')}</td></tr>
<tr><td>Sample subscription</td><td style="text-align:right">0.00</td></tr>
<tr><td colspan="2"><hr>Illustrative receipt only</td></tr></table>'''),
  MailHtmlLayoutFixture('Zalo-like fixed-width notice', '''
<center><table width="600" bgcolor="#fff"><tr>
<td style="padding:16px">$_logo${_copy('Thông báo từ nhóm của bạn')}
<p>Đây là nội dung minh họa để kiểm tra độ rộng văn bản.</p>
</td></tr></table></center>'''),
  MailHtmlLayoutFixture('Discord-like wrapped digest', '''
<div width="600" style="width:600px;margin:auto">
<table width="600"><tr><td style="padding:16px">$_logo
${_copy('A conversation you may have missed')}
<blockquote>A synthetic team message with a short reply.</blockquote>
</td></tr></table></div>'''),
];
