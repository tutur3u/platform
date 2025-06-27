'use client';

import { cn, formatBytes } from '@tuturuuu/utils/format';
import { File, FileText, Upload, X } from 'lucide-react';
import Image from 'next/image';
import { type HTMLAttributes, useCallback, useState } from 'react';
import type { DropzoneProps, FileRejection } from 'react-dropzone';
import Dropzone from 'react-dropzone';

import { toast } from 'sonner';
import { useControllableState } from '../../../hooks/use-controllable-state';
import { Button } from '../button';
import { ScrollArea } from '../scroll-area';
import { Separator } from '../separator';

export interface StatedFile {
  rawFile: File;
  url: string;
  status: 'pending' | 'uploading' | 'uploaded' | 'error';
}

interface FileUploaderProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Value of the uploader.
   * @type StatedFile[]
   * @default undefined
   * @example value={files}
   */
  value?: StatedFile[];

  /**
   * Function to be called when the value changes.
   * @type (files: StatedFile[]) => void
   * @default undefined
   * @example onValueChange={(files) => setFiles(files)}
   */
  // eslint-disable-next-line no-unused-vars
  onValueChange?: (files: StatedFile[]) => void;

  /**
   * Function to be called when files are uploaded.
   * @type (files: StatedFile[]) => Promise<void>
   * @default undefined
   * @example onUpload={(files) => uploadFiles(files)}
   */
  // eslint-disable-next-line no-unused-vars
  onUpload?: (files: StatedFile[]) => Promise<void>;

  /**
   * Accepted file types for the uploader.
   * @type { [key: string]: string[]}
   * @default
   * ```ts
   * { "image/*": [] }
   * ```
   * @example accept={["image/png", "image/jpeg"]}
   */
  accept?: DropzoneProps['accept'];

  /**
   * Maximum file size for the uploader.
   * @type number | undefined
   * @default 1024 * 1024 * 2 // 2MB
   * @example maxSize={1024 * 1024 * 2} // 2MB
   */
  maxSize?: DropzoneProps['maxSize'];

  /**
   * Maximum number of files for the uploader.
   * @type number | undefined
   * @default 1
   * @example maxFileCount={4}
   */
  maxFileCount?: DropzoneProps['maxFiles'];

  /**
   * Whether the uploader should accept multiple files.
   * @type boolean
   * @default false
   * @example multiple
   */
  multiple?: boolean;

  /**
   * Whether the uploader is disabled.
   * @type boolean
   * @default false
   * @example disabled
   */
  disabled?: boolean;
}

export function FileUploader(props: FileUploaderProps) {
  const {
    value: valueProp,
    onValueChange,
    onUpload,
    accept = {},
    maxSize = 1024 * 1024 * 2,
    maxFileCount = 1,
    multiple = false,
    disabled = false,
    className,
    ...dropzoneProps
  } = props;

  const [files, setFiles] = useControllableState({
    prop: valueProp,
    onChange: onValueChange,
  });

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      if (!multiple && maxFileCount === 1 && acceptedFiles.length > 1) {
        toast.error('Cannot upload more than 1 file at a time');
        return;
      }

      if ((files?.length ?? 0) + acceptedFiles.length > maxFileCount) {
        toast.error(`Cannot upload more than ${maxFileCount} files`);
        return;
      }

      const newFiles: StatedFile[] = acceptedFiles.map((file) => ({
        rawFile: file,
        url: URL.createObjectURL(file),
        status: 'pending',
      }));

      const updatedFiles = files ? [...files, ...newFiles] : newFiles;
      setFiles(updatedFiles);

      if (rejectedFiles.length > 0) {
        rejectedFiles.forEach(({ file }) => {
          toast.error(`File ${file.name} was rejected`);
        });
      }
    },
    [files, maxFileCount, multiple, setFiles]
  );

  function onRemove(index: number) {
    if (files?.[index]?.url) {
      URL.revokeObjectURL(files[index].url);
    }

    const newFiles = files?.filter((_, i) => i !== index);
    setFiles(newFiles);
  }

  const isDisabled = disabled || (files?.length ?? 0) >= maxFileCount;

  const [uploading, setUploading] = useState(false);

  async function onSubmit() {
    if (uploading || !files || !files.length) return;
    setUploading(true);
    await onUpload?.(files);
    setUploading(false);
  }

  return (
    <div className="relative flex flex-col overflow-hidden">
      <Dropzone
        onDrop={onDrop}
        accept={accept}
        maxSize={maxSize}
        maxFiles={maxFileCount}
        multiple={maxFileCount > 1 || multiple}
        disabled={isDisabled}
      >
        {({ getRootProps, getInputProps, isDragActive }) => (
          <div
            {...getRootProps()}
            className={cn(
              'group relative grid h-52 w-full cursor-pointer place-items-center rounded-lg border-2 border-dashed border-muted-foreground/25 px-6 py-2 text-center transition hover:bg-muted/25',
              'ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-hidden',
              isDragActive && 'border-muted-foreground/50',
              isDisabled && 'pointer-events-none opacity-60',
              className
            )}
            {...dropzoneProps}
          >
            <input {...getInputProps()} />
            {isDragActive ? (
              <div className="flex flex-col items-center justify-center gap-4 sm:px-5">
                <div className="rounded-full border border-dashed p-3">
                  <Upload
                    className="size-7 text-muted-foreground"
                    aria-hidden="true"
                  />
                </div>
                <p className="font-medium text-muted-foreground">
                  Drop the files here
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-4 sm:px-5">
                <div className="rounded-full border border-dashed p-3">
                  <Upload
                    className="size-7 text-muted-foreground"
                    aria-hidden="true"
                  />
                </div>
                <div className="flex flex-col gap-px">
                  <p className="font-medium text-muted-foreground">
                    Drag {`'n'`} drop files here, or click to select files
                  </p>
                  <p className="text-sm text-muted-foreground/70">
                    You can upload
                    {maxFileCount > 1
                      ? ` ${maxFileCount === Infinity ? 'multiple' : maxFileCount}
                      files (up to ${formatBytes(maxSize)} each)`
                      : ` a file with ${formatBytes(maxSize)}`}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </Dropzone>

      {files?.length ? (
        <ScrollArea className="h-fit w-full p-2 px-3">
          <div className="flex max-h-48 flex-col gap-1 py-4">
            {files?.map((file, index) => (
              <FileCard
                key={index}
                file={file}
                onRemove={() => onRemove(index)}
              />
            ))}
          </div>
        </ScrollArea>
      ) : null}

      <Separator className={files?.length ? 'mb-4' : 'my-4'} />

      <div className="flex gap-2">
        <Button
          type="button"
          className="w-fit"
          onClick={() => {
            setFiles([]);
          }}
          variant="ghost"
          disabled={
            uploading ||
            (files?.length ?? 0) === 0 ||
            ((files?.length ?? 0) > 0 &&
              files?.every((file) => file.status === 'uploaded'))
          }
        >
          Clear Files
        </Button>
        <Button
          type="button"
          className="w-full"
          onClick={onSubmit}
          disabled={
            uploading ||
            (files?.length ?? 0) === 0 ||
            ((files?.length ?? 0) > 0 &&
              files?.every((file) => file.status === 'uploaded'))
          }
        >
          Upload Files
        </Button>
      </div>
    </div>
  );
}

interface FileCardProps {
  file: StatedFile;
  onRemove: () => void;
}

function FileCard({ file, onRemove }: FileCardProps) {
  return (
    <div className="relative flex items-center gap-2 rounded-md p-2 hover:bg-foreground/5">
      <div className="flex flex-1 gap-2">
        <div className="aspect-square size-10 flex-none">
          <FilePreview file={file} />
        </div>
        <div className="flex w-full flex-col items-start gap-2 text-start">
          <div className="flex flex-col gap-px">
            <p className="line-clamp-1 text-sm font-semibold text-foreground/80">
              {file.rawFile.name}
            </p>
            <div className="text-xs font-semibold text-muted-foreground">
              {file.status === 'pending' && (
                <span>{formatBytes(file.rawFile.size)}</span>
              )}
              {file.status === 'uploading' && (
                <span className="opacity-70">Uploading...</span>
              )}
              {file.status === 'uploaded' && <span>Uploaded</span>}
              {file.status === 'error' && (
                <span className="text-destructive">Error</span>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-7"
          onClick={onRemove}
        >
          <X className="size-4" aria-hidden="true" />
          <span className="sr-only">Remove file</span>
        </Button>
      </div>
    </div>
  );
}

function FilePreview({ file }: { file: StatedFile }) {
  const isImage = file.rawFile.type.startsWith('image/');
  const isPdf = file.rawFile.type.startsWith('application/pdf');
  const isOther = !isImage && !isPdf;

  return (
    <>
      {isImage && (
        <a href={file.url} target="_blank" rel="noopener noreferrer">
          <Image
            src={file.url}
            alt={file.rawFile.name}
            width={48}
            height={48}
            loading="lazy"
            className="rounded-md object-cover"
          />
        </a>
      )}
      {isPdf && (
        <a href={file.url} target="_blank" rel="noopener noreferrer">
          <FileText className="size-10" aria-hidden="true" />
        </a>
      )}
      {isOther && <File className="size-10" aria-hidden="true" />}
    </>
  );
}
