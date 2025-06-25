'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ncthub/ui/dialog';
import { useState } from 'react';
import StudentForm, { type StudentFormData } from './StudentForm';

interface AddStudentDialogProps {
  trigger: React.ReactNode;
  onAdd: (name: string, studentNumber: string, program: string) => void;
}

export default function AddStudentDialog({
  trigger,
  onAdd,
}: AddStudentDialogProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleSubmit = (data: StudentFormData) => {
    onAdd(data.name, data.studentNumber, data.program ?? '');
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="p-6">
        <DialogHeader className="relative flex items-center justify-between">
          <DialogTitle className="text-xl font-semibold">
            Add New Student
          </DialogTitle>
        </DialogHeader>
        <StudentForm
          onSubmit={handleSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}
