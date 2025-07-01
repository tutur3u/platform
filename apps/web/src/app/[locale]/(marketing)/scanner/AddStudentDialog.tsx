'use client';

import StudentForm, { type StudentFormData } from './StudentForm';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ncthub/ui/dialog';
import { UserPlus } from '@ncthub/ui/icons';
import { useState } from 'react';

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
      <DialogContent>
        <DialogHeader className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 p-2">
              <UserPlus className="h-5 w-5 text-white" />
            </div>
            <div className="space-y-1">
              <DialogTitle className="text-xl font-semibold">
                Add New Student
              </DialogTitle>
              <DialogDescription className="text-gray-600">
                Manually add a student record to the database
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="mt-6">
          <StudentForm onSubmit={handleSubmit} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
