/** Capture file pastes before ProseMirror consumes the bubbling event. */
export function pasteMailFiles(
  event: {
    clipboardData: { files: Iterable<File>; items: Iterable<Pick<DataTransferItem, 'kind' | 'getAsFile'>> };
    preventDefault: () => void;
    stopPropagation: () => void;
  },
  addFiles: (files: File[], inline: boolean) => void
) {
  const files = Array.from(event.clipboardData.files);
  if (!files.length) {
    for (const item of Array.from(event.clipboardData.items)) {
      if (item.kind !== 'file') continue;
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  if (!files.length) return false;
  event.preventDefault();
  event.stopPropagation();
  for (const file of files) addFiles([file], file.type.startsWith('image/'));
  return true;
}

/** Extract embedded clipboard images without fetching remote or local URLs. */
export function embeddedMailImages(html: string) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const files: File[] = [];
  for (const image of document.querySelectorAll('img')) {
    const source = image.getAttribute('src') ?? '';
    if (!source.startsWith('data:')) continue;
    const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,([a-z0-9+/=\s]+)$/iu.exec(source);
    if (!match || source.length > 20 * 1024 * 1024)
      throw new Error('Unsupported or oversized clipboard image');
    const binary = atob(match[2]!);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    files.push(new File([bytes], `pasted-image-${files.length + 1}.${match[1]!.split('/')[1]}`, { type: match[1] }));
    image.remove();
  }
  return { files, html: document.body.innerHTML };
}
