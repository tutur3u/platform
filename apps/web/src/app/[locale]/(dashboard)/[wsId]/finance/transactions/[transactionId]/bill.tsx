'use client';

import { Button } from '@repo/ui/components/ui/button';
import {
  FileUploader,
  StatedFile,
} from '@repo/ui/components/ui/custom/file-uploader';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@repo/ui/components/ui/tooltip';
import { FileText, ImageIcon, Package, X } from 'lucide-react';
import { useState } from 'react';

interface Props {
  wsId: string;
  transactionId: string;
}
export function Bill({ wsId }: Props) {
  const [files, setFiles] = useState<StatedFile[]>([]);

  const onUpload = async (files: StatedFile[]) => {
    await Promise.all(
      files.map(async (file) => {
        if (file.status === 'uploaded') return;

        // Update the status to 'uploading'
        file.status = 'uploading';

        try {
          const formData = new FormData();
          formData.append('file', file);

          const res = await fetch(
            `/api/workspaces/${wsId}/upload?filename=${file.name}`,
            {
              method: 'POST',
              body: formData,
            }
          );

          if (res.status !== 200) {
            throw new Error('Upload failed');
          }

          // Update the status to 'uploaded'
          file.status = 'uploaded';
        } catch (error) {
          console.log(`Error uploading file ${file.name}:`, error);

          // Update the status to 'error'
          file.status = 'error';
        }
      })
    );
  };

  return (
    <>
      {files && files.length > 0 && (
        <TooltipProvider>
          <div className="mb-2 flex items-center gap-1 text-xs">
            {files.filter((f) => f.name.endsWith('.pdf')).length > 0 && (
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <div className="bg-foreground text-background flex w-fit items-center gap-1 rounded px-2 py-1 font-semibold">
                    <FileText className="h-4 w-4" />
                    {files.filter((f) => f.name.endsWith('.pdf')).length} PDFs
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="grid gap-1">
                    {files
                      .filter((f) => f.name.endsWith('.pdf'))
                      .map((f) => (
                        <div
                          key={f.preview}
                          className="group flex items-center gap-2 rounded"
                        >
                          <FileText className="h-4 w-4" />
                          <span className="line-clamp-1 w-full max-w-xs">
                            {f.name}
                          </span>
                          <Button
                            size="xs"
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              const newFiles = files.filter((file) => {
                                return file.name !== f.name;
                              });
                              setFiles(newFiles);
                            }}
                            className="opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                          >
                            <X />
                          </Button>
                        </div>
                      ))}
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
            {files.filter(
              (f) =>
                f.name.endsWith('.png') ||
                f.name.endsWith('.jpg') ||
                f.name.endsWith('.jpeg')
            ).length > 0 && (
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <div className="bg-foreground text-background flex w-fit items-center gap-1 rounded px-2 py-1 font-semibold">
                    <ImageIcon className="h-4 w-4" />
                    {
                      files.filter(
                        (f) =>
                          f.name.endsWith('.png') ||
                          f.name.endsWith('.jpg') ||
                          f.name.endsWith('.jpeg') ||
                          f.name.endsWith('.webp')
                      ).length
                    }{' '}
                    Images
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="grid gap-1">
                    {files
                      .filter(
                        (f) =>
                          f.name.endsWith('.png') ||
                          f.name.endsWith('.jpg') ||
                          f.name.endsWith('.jpeg') ||
                          f.name.endsWith('.webp')
                      )
                      .map((f) => (
                        <div
                          key={f.preview}
                          className="group flex items-center gap-2 rounded"
                        >
                          <div className="size-8">
                            <img
                              src={URL.createObjectURL(f)}
                              alt={f.name}
                              className="h-8 w-8 rounded object-cover"
                            />
                          </div>
                          <span className="line-clamp-1 w-full max-w-xs">
                            {f.name}
                          </span>
                          <Button
                            size="xs"
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              const newFiles = files.filter((file) => {
                                return file.name !== f.name;
                              });
                              setFiles(newFiles);
                            }}
                            className="opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                          >
                            <X />
                          </Button>
                        </div>
                      ))}
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
            {files.filter(
              (f) =>
                !f.name.endsWith('.pdf') &&
                !f.name.endsWith('.png') &&
                !f.name.endsWith('.jpg') &&
                !f.name.endsWith('.jpeg') &&
                !f.name.endsWith('.webp')
            ).length > 0 && (
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <div className="bg-foreground text-background flex w-fit items-center gap-1 rounded px-2 py-1 font-semibold">
                    <Package className="h-4 w-4" />
                    {
                      files.filter(
                        (f) =>
                          !f.name.endsWith('.pdf') &&
                          !f.name.endsWith('.png') &&
                          !f.name.endsWith('.jpg') &&
                          !f.name.endsWith('.jpeg') &&
                          !f.name.endsWith('.webp')
                      ).length
                    }{' '}
                    Files
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="grid gap-1">
                    {files
                      .filter(
                        (f) =>
                          !f.name.endsWith('.pdf') &&
                          !f.name.endsWith('.png') &&
                          !f.name.endsWith('.jpg') &&
                          !f.name.endsWith('.jpeg') &&
                          !f.name.endsWith('.webp')
                      )
                      .map((f) => (
                        <div
                          key={f.preview}
                          className="group flex items-center gap-2 rounded"
                        >
                          <Package className="h-4 w-4" />
                          <span className="line-clamp-1 w-full max-w-xs">
                            {f.name}
                          </span>
                          <Button
                            size="xs"
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              const newFiles = files.filter((file) => {
                                return file.name !== f.name;
                              });
                              setFiles(newFiles);
                            }}
                            className="opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                          >
                            <X />
                          </Button>
                        </div>
                      ))}
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </TooltipProvider>
      )}
      <FileUploader
        value={files}
        onValueChange={setFiles}
        maxFileCount={10}
        maxSize={50 * 1024 * 1024}
        onUpload={onUpload}
      />
    </>
  );
}
