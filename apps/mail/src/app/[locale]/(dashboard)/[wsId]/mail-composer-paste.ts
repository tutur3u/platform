/** Capture file pastes before ProseMirror consumes the bubbling event. */
type MailClipboard = {
  files: Iterable<File>;
  items: Iterable<Pick<DataTransferItem, 'kind' | 'getAsFile'>>;
  getData?: (format: string) => string;
};

export function mailClipboardFiles(clipboard: MailClipboard) {
  const files = Array.from(clipboard.files);
  if (!files.length) {
    for (const item of Array.from(clipboard.items)) {
      if (item.kind !== 'file') continue;
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  return files;
}

export function pasteMailFiles(
  event: {
    clipboardData: MailClipboard;
    preventDefault: () => void;
    stopPropagation: () => void;
  },
  addFiles: (files: File[], inline: boolean) => void
) {
  const files = mailClipboardFiles(event.clipboardData);
  // Rich selections must retain their text and original image positions.
  if (/<img[\s>]/iu.test(event.clipboardData.getData?.('text/html') ?? ''))
    return false;
  if (!files.length) return false;
  event.preventDefault();
  event.stopPropagation();
  for (const file of files) addFiles([file], file.type.startsWith('image/'));
  return true;
}

/** Extract embedded clipboard images without fetching remote or local URLs. */
export function embeddedMailImages(html: string, clipboardFiles: File[] = []) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const files: File[] = [];
  const availableImages = clipboardFiles.filter((file) =>
    file.type.startsWith('image/')
  );
  const segments: { content: DocumentFragment; file: File }[] = [];
  for (const image of document.querySelectorAll('img')) {
    const source = image.getAttribute('src') ?? '';
    const clipboardImage = availableImages.shift();
    if (!source.startsWith('data:') && !clipboardImage) continue;
    const match =
      /^data:(image\/(?:png|jpeg|gif|webp));base64,([a-z0-9+/=\s]+)$/iu.exec(
        source
      );
    if (!clipboardImage && (!match || source.length > 20 * 1024 * 1024))
      throw new Error('Unsupported or oversized clipboard image');
    const binary = clipboardImage ? '' : atob(match?.[2] ?? '');
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0)
    );
    const file =
      clipboardImage ??
      new File(
        [bytes],
        `pasted-image-${files.length + 1}.${match?.[1]?.split('/')[1] ?? 'png'}`,
        { type: match?.[1] ?? 'image/png' }
      );
    files.push(file);
    const range = document.createRange();
    range.setStart(document.body, 0);
    range.setEndBefore(image);
    segments.push({ content: range.extractContents(), file });
    image.remove();
  }
  return {
    attachments: clipboardFiles.filter((file) => !files.includes(file)),
    files,
    html: document.body.innerHTML,
    segments,
    tail: document.body,
  };
}
