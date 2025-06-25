'use client';

import StudentList from '../StudentList';
import { Student } from '@ncthub/types/primitives/Student';
import { Button } from '@ncthub/ui/button';
import { useToast } from '@ncthub/ui/hooks/use-toast';
import Link from 'next/link';
import React, { useCallback, useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ArrowLeft } from '@ncthub/ui/icons';

export default function Page() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchStudents = useCallback(
    async (startDate?: Date | null, endDate?: Date | null) => {
      try {
        const params = new URLSearchParams();
        if (startDate) {
          params.append('startDate', startDate.toISOString());
        }
        if (endDate) {
          params.append('endDate', endDate.toISOString());
        }

        const response = await fetch(
          `/api/students${params.toString() ? `?${params.toString()}` : ''}`
        );

        if (!response.ok) {
          throw new Error('Failed to fetch students');
        }

        const data = await response.json();
        const students: Student[] = data.students.map(
          (student: {
            id: string;
            name: string;
            student_number: string;
            program: string;
            created_at: Date;
          }) => ({
            ...student,
            studentNumber: student.student_number,
            timestamp: new Date(student.created_at),
          })
        );

        setStudents(students);
      } catch (error) {
        console.error(error);
        setError('Failed to fetch students');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchStudents(null, null);
  }, [fetchStudents]);

  const handleDateRangeApply = (
    startDate: Date | null,
    endDate: Date | null
  ) => {
    fetchStudents(startDate, endDate);
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

  const handleAddStudent = async (
    name: string,
    studentNumber: string,
    program: string
  ) => {
    const newStudent = createStudentRecord({
      name,
      studentNumber,
      program,
    });

    try {
      const response = await fetch(`/api/students`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newStudent),
      });

      if (!response.ok) {
        throw new Error('Failed to add student');
      }

      setStudents([...students, newStudent]);
    } catch (error) {
      console.error(error);

      toast({
        title: 'Failed to add student',
        description: 'Please try again',
        variant: 'destructive',
      });
    }
  };

  const handleUpdateStudent = async (updatedStudent: Student) => {
    try {
      const response = await fetch(`/api/students/${updatedStudent.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedStudent),
      });

      if (!response.ok) {
        throw new Error('Failed to update student');
      }

      const updatedStudents = students.map((student) =>
        student.id === updatedStudent.id ? updatedStudent : student
      );
      setStudents(updatedStudents);
    } catch (error) {
      console.error(error);

      toast({
        title: 'Failed to update student',
        description: 'Please try again',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteStudent = async (id: string) => {
    try {
      const response = await fetch(`/api/students/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete student');
      }

      const updatedStudents = students.filter((student) => student.id !== id);
      setStudents(updatedStudents);

      toast({
        title: 'Student Deleted',
        description: 'Student has been deleted successfully',
      });
    } catch (error) {
      console.error(error);

      toast({
        title: 'Failed to delete student',
        description: 'Please try again',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return <div className="p-4 text-center">Loading students...</div>;
  }

  if (error) {
    return <div className="p-4 text-center text-red-500">{error}</div>;
  }

  return (
    <div className="container min-h-screen mx-auto">
      <div className="mt-4">
        <Link href="/scanner">
          <Button
            variant="outline"
            size="lg"
            className="h-12 text-base font-medium bg-primary/10 hover:bg-primary/20"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            Back to Capture Page
          </Button>
        </Link>
      </div>

      <div className="px-4 py-16">
        <div className="text-center space-y-4">
          <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-dynamic-light-blue to-dynamic-blue bg-clip-text text-transparent">
            Student Records
          </h1>
          <p className="text-xl text-dynamic-light-sky max-w-2xl mx-auto">
            Manage and track student information
          </p>
        </div>
      </div>

      <StudentList
        students={students}
        onAdd={handleAddStudent}
        onUpdate={handleUpdateStudent}
        onDelete={handleDeleteStudent}
        onDateRangeApply={handleDateRangeApply}
      />
    </div>
  );
}
