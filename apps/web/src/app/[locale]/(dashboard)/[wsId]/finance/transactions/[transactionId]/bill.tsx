'use client';

import { createDynamicClient } from '@repo/supabase/next/client';
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
import { File, FileText, ImageIcon, X } from 'lucide-react';
import { useState } from 'react';

interface Props {
  wsId: string;
  transactionId: string;
}

export function Bill({ wsId, transactionId }: Props) {
  const [files, setFiles] = useState<StatedFile[]>([]);

  const pdfs = files.filter((f) =>
    f.rawFile.type.startsWith('application/pdf')
  );
  const images = files.filter((f) => f.rawFile.type.startsWith('image/'));
  const others = files.filter((f) => !pdfs.includes(f) && !images.includes(f));

  const onUpload = async (files: StatedFile[]) => {
    await Promise.all(
      files.map(async (file) => {
        // If the file is already uploaded, skip it
        if (file.status === 'uploaded') return file;

        // Update the status to 'uploading'
        setFiles((prevFiles) =>
          prevFiles.map((f) =>
            f.url === file.url ? { ...file, status: 'uploading' } : f
          )
        );

        const { error } = await uploadBill(wsId, transactionId, file);

        if (error) {
          console.error('File upload error:', error);
        }

        // Update the status to 'uploaded' or 'error'
        setFiles((prevFiles) =>
          prevFiles.map((f) =>
            f.url === file.url
              ? { ...file, status: error ? 'error' : 'uploaded' }
              : f
          )
        );

        return { file, error };
      })
    );
  };

  return (
    <>
      {files.length > 0 && (
        <TooltipProvider>
          <div className="mb-2 flex items-center gap-1 text-xs">
            {pdfs.length > 0 && (
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <div className="bg-foreground text-background flex w-fit items-center gap-1 rounded px-2 py-1 font-semibold">
                    <FileText className="h-4 w-4" />
                    {pdfs.length} PDFs
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="grid gap-1">
                    {pdfs.map((f) => (
                      <div
                        key={f.url}
                        className="group flex items-center gap-2 rounded"
                      >
                        <FileText className="h-4 w-4" />
                        <span className="line-clamp-1 w-full max-w-xs">
                          {f.rawFile.name}
                        </span>
                        <Button
                          size="xs"
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            const newFiles = files.filter((file) => {
                              return file.url !== f.url;
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
            {images.length > 0 && (
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <div className="bg-foreground text-background flex w-fit items-center gap-1 rounded px-2 py-1 font-semibold">
                    <ImageIcon className="h-4 w-4" />
                    {images.length} Images
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="grid gap-1">
                    {images.map((f) => (
                      <div
                        key={f.url}
                        className="group flex items-center gap-2 rounded"
                      >
                        <div className="size-8">
                          <img
                            src={URL.createObjectURL(f.rawFile)}
                            alt={f.rawFile.name}
                            className="h-8 w-8 rounded object-cover"
                          />
                        </div>
                        <span className="line-clamp-1 w-full max-w-xs">
                          {f.rawFile.name}
                        </span>
                        <Button
                          size="xs"
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            const newFiles = files.filter((file) => {
                              return file.url !== f.url;
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
            {others.length > 0 && (
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <div className="bg-foreground text-background flex w-fit items-center gap-1 rounded px-2 py-1 font-semibold">
                    <File className="h-4 w-4" />
                    {others.length} Files
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="grid gap-1">
                    {others.map((f) => (
                      <div
                        key={f.url}
                        className="group flex items-center gap-2 rounded"
                      >
                        <File className="h-4 w-4" />
                        <span className="line-clamp-1 w-full max-w-xs">
                          {f.rawFile.name}
                        </span>
                        <Button
                          size="xs"
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            const newFiles = files.filter((file) => {
                              return file.url !== f.url;
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

export async function uploadBill(
  wsId: string,
  transactionId: string,
  file: StatedFile
): Promise<{ data: any; error: any }> {
  const fileName = file.rawFile.name;
  const hasExtension = fileName.lastIndexOf('.') !== -1;
  const baseName = hasExtension
    ? fileName.substring(0, fileName.lastIndexOf('.'))
    : fileName;
  const fileExtension = hasExtension
    ? fileName.substring(fileName.lastIndexOf('.') + 1)
    : '';
  let newFileName = fileName;

  const supabase = createDynamicClient();

  // Check if a file with the same name already exists
  const { data: existingFileName } = await supabase
    .schema('storage')
    .from('objects')
    .select('*')
    .eq('bucket_id', 'workspaces')
    .not('owner', 'is', null)
    .eq('name', `${wsId}/finance/transactions/${transactionId}/${fileName}`)
    .order('name', { ascending: true });

  const { data: existingFileNames } = await supabase
    .schema('storage')
    .from('objects')
    .select('*')
    .eq('bucket_id', 'workspaces')
    .not('owner', 'is', null)
    .ilike(
      'name',
      `${wsId}/finance/transactions/${transactionId}/${baseName}(%).${fileExtension}`
    )
    .order('name', { ascending: true });

  if (existingFileName && existingFileName.length > 0) {
    if (existingFileNames && existingFileNames.length > 0) {
      const lastFileName = existingFileNames[existingFileNames.length - 1].name;
      const lastFileNameIndex = parseInt(
        lastFileName.substring(
          lastFileName.lastIndexOf('(') + 1,
          lastFileName.lastIndexOf(')')
        )
      );
      newFileName = `${baseName}(${lastFileNameIndex + 1}).${fileExtension}`;
    } else {
      newFileName = `${baseName}(1).${fileExtension}`;
    }
  }

  const { data, error } = await supabase.storage
    .from('workspaces')
    .upload(
      `${wsId}/finance/transactions/${transactionId}/${newFileName}`,
      file.rawFile
    );

  return { data, error };
}
