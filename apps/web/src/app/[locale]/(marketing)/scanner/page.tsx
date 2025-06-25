'use client';

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
import { useToast } from '@ncthub/ui/hooks/use-toast';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import StudentForm from './StudentForm';

export default function Page() {
  const [newStudent, setNewStudent] = useState<Student | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const { toast } = useToast();

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
    program: string | null;
  }): Student => {
    return {
      id: uuidv4(),
      name: studentData.name.trim(),
      studentNumber: studentData.studentNumber.trim(),
      program: studentData.program ? studentData.program.trim() : null,
      timestamp: new Date(),
    };
  };

  const handleNewStudent = (name: string, studentNumber: string) => {
    const newStudent = createStudentRecord({
      name,
      studentNumber,
      program: null,
    });

    setNewStudent(newStudent);
  };

  const handleAddStudent = (
    name: string,
    studentNumber: string,
    program: string | null
  ) => {
    const newStudent = createStudentRecord({ name, studentNumber, program });
    setStudents([...students, newStudent]);
  };

  const handleUpdateStudent = (updatedStudent: Student) => {
    const updatedStudents = students.map((student) =>
      student.id === updatedStudent.id ? updatedStudent : student
    );
    setStudents(updatedStudents);
  };

  const handleDeleteStudent = (id: string) => {
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
      console.error(error);

      toast({
        title: 'Failed to upload students to database',
        description: 'Please try again',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="container min-h-screen mx-auto">
      <div className="flex flex-col gap-8 md:flex-row mt-4">
        <div className="flex-1 p-2 md:w-1/2 space-y-4">
          <VideoCapture handleNewStudent={handleNewStudent} />
          <StudentForm
            defaultValues={newStudent ? {
              name: newStudent.name,
              studentNumber: newStudent.studentNumber,
              program: newStudent.program ?? undefined,
            } : undefined}
            onSubmit={(data) => {
              handleAddStudent(data.name, data.studentNumber, data.program ?? null);
              setNewStudent(null);
            }}
          />
        </div>

        <div className="flex-1 p-2 md:w-1/2 space-y-4">
          <StudentList
            students={filteredStudents}
            onAdd={handleAddStudent}
            onUpdate={handleUpdateStudent}
            onDelete={handleDeleteStudent}
            onDateRangeApply={handleDateRangeApply}
          />

          <div className="flex justify-center gap-4">
            <Button
              className={`rounded-lg bg-red-500 px-4 py-2 text-white hover:bg-red-600 ${students.length === 0 && 'opacity-50'
                }`}
              disabled={students.length === 0}
              onClick={() => setShowClearDialog(true)}
            >
              Clear History
            </Button>
            <Button
              className={`rounded-lg bg-green-500 px-4 py-2 text-white hover:bg-green-600 ${students.length === 0 && 'opacity-50'
                }`}
              disabled={students.length === 0}
              onClick={handleUpload}
            >
              Upload to Database
            </Button>
          </div>

          <div className="flex justify-center">
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
              <AlertDialogAction onClick={handleClear}>Clear</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
