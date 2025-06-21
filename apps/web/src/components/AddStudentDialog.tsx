'use client';

import { Button } from '@ncthub/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@ncthub/ui/dialog';
import { ChangeEvent, useState } from 'react';

interface AddStudentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (name: string, studentNumber: string, program: string) => void;
  error: string | null;
}

const AddStudentDialog: React.FC<AddStudentDialogProps> = ({
  isOpen,
  onClose,
  onAdd,
  error,
}) => {
  const [name, setName] = useState('');
  const [studentNumber, setStudentNumber] = useState('');
  const [program, setProgram] = useState('');

  const handleAdd = () => {
    onAdd(name, studentNumber, program);
    if (!error) {
      setName('');
      setStudentNumber('');
      setProgram('');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
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
            value={name}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setName(e.target.value)
            }
            className="w-full rounded-lg border p-2 focus:ring-2 focus:ring-[#4896ac] focus:outline-none"
          />
          <input
            type="text"
            placeholder="Student Number"
            value={studentNumber}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setStudentNumber(e.target.value)
            }
            className="w-full rounded-lg border p-2 focus:ring-2 focus:ring-[#4896ac] focus:outline-none"
          />
          <input
            type="text"
            placeholder="Program"
            value={program}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setProgram(e.target.value)
            }
            className="w-full rounded-lg border p-2 focus:ring-2 focus:ring-[#4896ac] focus:outline-none"
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
        <Button
          onClick={handleAdd}
          className="w-full rounded-lg bg-[#4896ac] py-2 text-white transition hover:bg-[#326979]"
        >
          Add Student
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default AddStudentDialog;
