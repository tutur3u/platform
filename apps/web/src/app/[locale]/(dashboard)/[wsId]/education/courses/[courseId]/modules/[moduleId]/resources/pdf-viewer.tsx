'use client';

import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  `https://unpkg.com/pdfjs-dist@${pdfjs.version}/legacy/build/pdf.worker.min.mjs`
).toString();

export function PDFViewer({ url }: { url: string }) {
  const t = useTranslations();
  const containerRef = useRef<HTMLDivElement>(null);

  const [pageNumber, setPageNumber] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [pdfWidth, setPdfWidth] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  useEffect(() => {
    const updatePdfWidth = () => {
      if (containerRef.current) {
        setPdfWidth(containerRef.current.offsetWidth);
      }
    };

    updatePdfWidth();
    window.addEventListener('resize', updatePdfWidth);
    return () => window.removeEventListener('resize', updatePdfWidth);
  }, []);

  const changePage = (offset: number) => {
    setIsLoading(true);
    setPageNumber((prevPageNumber) => {
      const newPageNumber = prevPageNumber + offset;
      return Math.max(1, Math.min(newPageNumber, numPages));
    });
  };

  return (
    <div ref={containerRef} className="relative">
      <Document file={url} onLoadSuccess={onDocumentLoadSuccess}>
        <AnimatePresence mode="wait">
          <motion.div
            key={pageNumber}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="relative aspect-video"
            style={{ width: pdfWidth }}
          >
            <div
              className="absolute inset-0 aspect-video animate-pulse bg-white"
              style={{ width: pdfWidth }}
            />
            <Page
              pageNumber={pageNumber}
              width={pdfWidth}
              renderAnnotationLayer={false}
              renderTextLayer={false}
              onRenderSuccess={() => setIsLoading(false)}
              className={cn(isLoading ? 'opacity-0' : 'opacity-100')}
              loading={
                <div
                  className="absolute inset-0 aspect-video animate-pulse bg-white"
                  style={{ width: pdfWidth }}
                />
              }
            />
          </motion.div>
        </AnimatePresence>
      </Document>
      <div className="mt-2 flex flex-col items-stretch justify-center gap-2">
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => changePage(-1)}
            disabled={pageNumber <= 1 || isLoading}
            className="w-full md:w-auto"
          >
            <ChevronLeft className="h-4 w-4" />
            {t('common.previous')}
          </Button>
          <p className="hidden text-center text-sm md:block">
            {t('common.page')} <span className="font-bold">{pageNumber}</span>{' '}
            {t('common.of')} <span className="font-bold">{numPages || 1}</span>
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => changePage(1)}
            disabled={pageNumber >= numPages || isLoading}
            className="w-full md:w-auto"
          >
            {t('common.next')}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-center text-sm md:hidden">
          {t('common.page')} <span className="font-bold">{pageNumber}</span>{' '}
          {t('common.of')} <span className="font-bold">{numPages || 1}</span>
        </p>
      </div>
    </div>
  );
}
