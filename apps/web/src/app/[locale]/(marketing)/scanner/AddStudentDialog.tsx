'use client';

import { Button } from '@ncthub/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ncthub/ui/dialog';
import { ChangeEvent, useState } from 'react';

interface AddStudentDialogProps {
  trigger: React.ReactNode;
  onAdd: (name: string, studentNumber: string, program: string) => void;
}

export default function AddStudentDialog({
  trigger,
  onAdd,
}: AddStudentDialogProps) {
  const [name, setName] = useState<string | null>(null);
  const [studentNumber, setStudentNumber] = useState<string | null>(null);
  const [program, setProgram] = useState<string | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const handleAdd = () => {
    if (!name || !studentNumber) {
      setAddError('Please enter name and student number');
      return;
    }

    onAdd(name, studentNumber, program ?? '');

    setName(null);
    setStudentNumber(null);
    setProgram(null);

    setAddError(null);
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
        <div className="grid gap-4 py-4">
          <input
            type="text"
            placeholder="Name"
            value={name ?? ''}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setName(e.target.value)
            }
            className="w-full rounded-lg border p-2 focus:ring-2 focus:ring-[#4896ac] focus:outline-none"
          />
          <input
            type="text"
            placeholder="Student Number"
            value={studentNumber ?? ''}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setStudentNumber(e.target.value)
            }
            className="w-full rounded-lg border p-2 focus:ring-2 focus:ring-[#4896ac] focus:outline-none"
          />
          <input
            type="text"
            placeholder="Program"
            value={program ?? ''}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setProgram(e.target.value)
            }
            className="w-full rounded-lg border p-2 focus:ring-2 focus:ring-[#4896ac] focus:outline-none"
          />
          {addError && <p className="text-sm text-red-500">{addError}</p>}
        </div>
        <Button
          onClick={handleAdd}
          className="w-full rounded-lg py-2 transition"
        >
          Add Student
        </Button>
      </DialogContent>
    </Dialog>
  );
}
