/** Only passive formats may be embedded on the authenticated Mail origin. */
export function mailAttachmentPreviewType(
  contentType: string,
  filename: string
) {
  const type = contentType.split(';')[0]!.trim().toLowerCase();
  if (/^image\/(png|jpeg|gif|webp|avif|bmp)$/u.test(type))
    return { kind: 'image', contentType: type } as const;
  if (/^video\/(mp4|webm|ogg|quicktime)$/u.test(type))
    return { kind: 'video', contentType: type } as const;
  if (/^audio\/(mpeg|mp4|ogg|wav|webm|x-wav)$/u.test(type))
    return { kind: 'audio', contentType: type } as const;
  if (
    type === 'text/plain' ||
    (type === 'application/octet-stream' && /\.txt$/iu.test(filename))
  )
    return { kind: 'text', contentType: 'text/plain; charset=utf-8' } as const;
  return null;
}

export function mailAttachmentPreviewUrl(url: string) {
  return `${url}${url.includes('?') ? '&' : '?'}preview=1`;
}
