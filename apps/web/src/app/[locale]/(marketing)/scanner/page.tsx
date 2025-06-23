'use client';

import AddStudentDialog from './AddStudentDialog';
import StudentList from './StudentList';
import VideoCapture from './VideoCapture';
import { Student } from '@ncthub/types/primitives/Student';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@ncthub/ui/alert-dialog';
import { Button } from '@ncthub/ui/button';
import { toast } from '@ncthub/ui/hooks/use-toast';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

export default function Page() {
  const [students, setStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [editID, setEditID] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editStudentNumber, setEditStudentNumber] = useState<string>('');
  const [editProgram, setEditProgram] = useState<string>('');
  const [showOpenDialog, setShowOpenDialog] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);

  useEffect(() => {
    const storedStudents = localStorage.getItem('students');
    if (storedStudents) {
      try {
        const parsedStudents = JSON.parse(storedStudents).map(
          (student: {
            id: string;
            name: string;
            studentNumber: string;
            program: string;
            timestamp: string;
          }) => ({
            ...student,
            timestamp: new Date(student.timestamp),
          })
        );
        if (parsedStudents.length > 0) {
          setStudents(parsedStudents);
        }
      } catch (error) {
        console.error('Error parsing stored students:', error);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('students', JSON.stringify(students));
    setFilteredStudents(students);
  }, [students]);

  const handleDateRangeApply = (
    startDate: Date | null,
    endDate: Date | null
  ) => {
    if (!startDate && !endDate) return;

    const filtered = students.filter((student) => {
      const studentDate = new Date(student.timestamp);
      if (startDate && endDate) {
        return studentDate >= startDate && studentDate <= endDate;
      } else if (startDate) {
        return studentDate >= startDate;
      } else if (endDate) {
        return studentDate <= endDate;
      }
      return true;
    });

    setFilteredStudents(filtered);
  };

  const createStudentRecord = (studentData: {
    name: string;
    studentNumber: string;
    program: string;
  }): Student => {
    return {
      id: uuidv4(),
      name: studentData.name.trim(),
      studentNumber: studentData.studentNumber.trim(),
      program: studentData.program ? studentData.program.trim() : '',
      timestamp: new Date(),
    };
  };

  const handleNewStudent = (name: string, studentNumber: string) => {
    const oldStudent = students.find(
      (item) => item.studentNumber.trim() === studentNumber.trim()
    );

    if (oldStudent) {
      const updatedStudent = {
        ...oldStudent,
        name: name,
        studentNumber: studentNumber,
      };
      setStudents(
        students.map((student) =>
          student.id === oldStudent.id ? updatedStudent : student
        )
      );

      setCaptureError('');
    } else {
      const newStudent = createStudentRecord({
        name,
        studentNumber,
        program: '',
      });
      setStudents([...students, newStudent]);

      setCaptureError('');
    }
  };

  const handleAdd = (name: string, studentNumber: string, program: string) => {
    if (!name || !studentNumber) {
      setAddError('Please enter name and student number');
      return;
    }

    const newStudent = createStudentRecord({ name, studentNumber, program });
    setStudents([...students, newStudent]);

    setAddError('');
    setShowOpenDialog(false);
  };

  const handleEdit = (id: string) => {
    const student = students.find((s) => s.id === id);
    if (!student) return;

    setEditID(id);
    setEditName(student.name);
    setEditStudentNumber(student.studentNumber);
    setEditProgram(student.program);
  };

  const handleSave = () => {
    if (editID === null) return;

    const oldStudent = students.find((s) => s.id === editID);
    if (!oldStudent) return;

    const updatedStudent = {
      ...oldStudent,
      name: editName,
      studentNumber: editStudentNumber,
      program: editProgram,
    };

    const updatedStudents = students.map((student) =>
      student.id === editID ? updatedStudent : student
    );
    setStudents(updatedStudents);

    setEditID(null);
    setEditName('');
    setEditStudentNumber('');
    setEditProgram('');
  };

  const handleDelete = (id: string) => {
    const updatedStudents = students.filter((s) => s.id !== id);
    setStudents(updatedStudents);

    toast({
      title: 'Student Deleted',
      description: 'Student has been deleted successfully',
    });
  };

  const handleClear = () => {
    setStudents([]);
  };

  const handleUpload = async () => {
    const uploadPromises = students.map((student) =>
      fetch(`/api/students`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: student.name,
          studentNumber: student.studentNumber,
          program: student.program,
          timestamp: student.timestamp,
        }),
      })
    );

    try {
      const results = await Promise.allSettled(uploadPromises);

      const successfulUploads = results.filter(
        (result) => result.status === 'fulfilled'
      );

      if (successfulUploads.length > 0) {
        const remainingStudents = students.filter((_, index) => {
          const result = results[index];
          return result && result.status === 'rejected';
        });
        setStudents(remainingStudents);

        toast({
          title: 'Students Uploaded',
          description: `Successfully uploaded ${successfulUploads.length} student(s)`,
        });
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error(error);
      }

      toast({
        title: 'Failed to upload students to database',
        description: 'Please try again',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="flex flex-col gap-8 md:flex-row">
      <div className="flex-1 p-2 md:w-1/2">
        <VideoCapture
          error={captureError}
          setError={setCaptureError}
          handleNewStudent={handleNewStudent}
        />
      </div>

      <div className="flex-1 p-2 md:w-1/2">
        <StudentList
          students={filteredStudents}
          editID={editID}
          editStudentNumber={editStudentNumber}
          editName={editName}
          editProgram={editProgram}
          setEditName={setEditName}
          setEditStudentNumber={setEditStudentNumber}
          setEditProgram={setEditProgram}
          handleAdd={() => setShowOpenDialog(true)}
          handleEdit={handleEdit}
          handleSave={handleSave}
          handleDelete={handleDelete}
          handleDateRangeApply={handleDateRangeApply}
        />
        <AddStudentDialog
          isOpen={showOpenDialog}
          onClose={() => {
            setShowOpenDialog(false);
            setAddError(null);
          }}
          onAdd={handleAdd}
          error={addError}
        />
        <div className="mt-4 flex justify-center gap-4">
          <Button
            className={`rounded-lg bg-red-600 px-4 py-2 text-white ${
              students.length === 0
                ? 'cursor-not-allowed opacity-50'
                : 'transition hover:bg-red-700'
            }`}
            disabled={students.length === 0}
            onClick={() => setShowClearDialog(true)}
          >
            Clear History
          </Button>
          <Button
            className={`rounded-lg bg-green-600 px-4 py-2 text-white ${
              students.length === 0
                ? 'cursor-not-allowed opacity-50'
                : 'transition hover:bg-green-700'
            }`}
            disabled={students.length === 0}
            onClick={handleUpload}
          >
            Upload to Database
          </Button>
        </div>
        <div className="mt-4 flex justify-center">
          <Link href="/scanner/list">
            <Button className="rounded-lg px-4 py-2">View all students</Button>
          </Link>
        </div>
      </div>

      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear History</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to clear the history? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-background text-foreground hover:bg-background/80"
              onClick={handleClear}
            >
              Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
