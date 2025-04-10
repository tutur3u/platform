'use client';

import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Download } from 'lucide-react';
import { useState } from 'react';

interface ExportButtonProps {
  wsId: string;
  projectId: string;
  project: any;
}

export function ExportButton({ wsId, projectId, project }: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const exportToPdf = async () => {
    try {
      setIsExporting(true);
      toast({
        title: 'Preparing PDF',
        description: 'Your analysis is being prepared for download...',
      });

      // Give time for the toast to appear before continuing
      await new Promise((resolve) => setTimeout(resolve, 500));

      // We need to target the element containing the analysis
      const element = document.getElementById('architecture-analysis');
      if (!element) {
        throw new Error('Analysis content not found');
      }

      // Create a canvas from the element
      const canvas = await html2canvas(element, {
        scale: 2, // Better quality
        useCORS: true,
        logging: false,
        allowTaint: true,
        backgroundColor: '#ffffff',
      });

      // Create a new PDF document
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      // Add a title page
      pdf.setFontSize(24);
      pdf.setTextColor(0, 0, 0);
      pdf.text(`Building Analysis: ${project.name}`, 20, 30);

      pdf.setFontSize(14);
      pdf.text(`Location: ${project.location}`, 20, 45);
      pdf.text(`Generated: ${new Date().toLocaleDateString()}`, 20, 55);

      // Add the canvas as an image on a new page
      const imgData = canvas.toDataURL('image/png');

      // Calculate the width to maintain aspect ratio
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const canvasRatio = canvas.height / canvas.width;
      const imgWidth = pdfWidth - 40; // margins
      const imgHeight = imgWidth * canvasRatio;

      // Split into multiple pages if needed
      let heightLeft = imgHeight;
      let position = 20; // initial y-position
      let pageCount = 1;

      pdf.addPage();

      pdf.addImage(imgData, 'PNG', 20, position, imgWidth, imgHeight);

      // Save the PDF
      pdf.save(`${project.name}-analysis.pdf`);

      toast({
        title: 'PDF exported',
        description: 'Your analysis has been downloaded as a PDF file.',
      });
    } catch (error) {
      console.error('PDF export error:', error);
      toast({
        title: 'Export failed',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to export the analysis to PDF',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={exportToPdf}
      disabled={isExporting}
    >
      <Download className="h-4 w-4" />
      <span className="sr-only">Export to PDF</span>
    </Button>
  );
}
