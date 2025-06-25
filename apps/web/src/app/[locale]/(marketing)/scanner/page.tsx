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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ncthub/ui/card';
import { Badge } from '@ncthub/ui/badge';
import { useToast } from '@ncthub/ui/hooks/use-toast';
import { Separator } from '@ncthub/ui/separator';
import {
  Camera,
  Users,
  Upload,
  Trash2,
  TrendingUp,
  Clock,
  Scan,
  Database,
  FileText
} from '@ncthub/ui/icons';
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

  // Stats calculations
  const todayCount = students.filter(
    s => new Date(s.timestamp).toDateString() === new Date().toDateString()
  ).length;

  const thisWeekCount = students.filter(s => {
    const studentDate = new Date(s.timestamp);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return studentDate >= weekAgo;
  }).length;

  return (
    <div className="container min-h-screen mx-auto">
      {/* Hero Section */}
      <div className="px-4 py-16">
        <div className="text-center space-y-4">
          <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-dynamic-light-blue to-dynamic-blue bg-clip-text text-transparent">
            Student ID Scanner
          </h1>
          <p className="text-xl text-dynamic-light-sky max-w-2xl mx-auto">
            Effortlessly capture and manage student information with our AI-powered scanning technology
          </p>
        </div>
      </div>

      <div className="px-4 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-sm font-medium">Total Students</p>
                  <p className="text-3xl font-bold">{students.length}</p>
                </div>
                <Users className="h-8 w-8 text-blue-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100 text-sm font-medium">Today</p>
                  <p className="text-3xl font-bold">{todayCount}</p>
                </div>
                <Clock className="h-8 w-8 text-green-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100 text-sm font-medium">This Week</p>
                  <p className="text-3xl font-bold">{thisWeekCount}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-purple-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-orange-100 text-sm font-medium">Pending Upload</p>
                  <p className="text-3xl font-bold">{students.length}</p>
                </div>
                <Upload className="h-8 w-8 text-orange-200" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {/* Scanner Section */}
          <div className="space-y-6">
            <Card className="border-0 shadow-xl">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
                    <Camera className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">ID Scanner</CardTitle>
                    <CardDescription>Point camera at student ID to capture information</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <VideoCapture handleNewStudent={handleNewStudent} />
              </CardContent>
            </Card>

            <Card className="border-0 shadow-xl">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg">
                    <FileText className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">Student Information</CardTitle>
                    <CardDescription>Review and complete student details</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
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
              </CardContent>
            </Card>
          </div>

          {/* Student List Section */}
          <div className="space-y-6">
            <Card className="border-0 shadow-xl">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg">
                      <Users className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">Student Records</CardTitle>
                      <CardDescription>Manage captured student information</CardDescription>
                    </div>
                  </div>
                  <Badge variant="secondary" className="px-3 py-1">
                    {filteredStudents.length} students
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <StudentList
                  students={filteredStudents}
                  onAdd={handleAddStudent}
                  onUpdate={handleUpdateStudent}
                  onDelete={handleDeleteStudent}
                  onDateRangeApply={handleDateRangeApply}
                />
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Button
                size="lg"
                variant="destructive"
                className="h-14 text-base font-medium shadow-lg"
                disabled={students.length === 0}
                onClick={() => setShowClearDialog(true)}
              >
                <Trash2 className="h-5 w-5 mr-2" />
                Clear History
              </Button>

              <Button
                size="lg"
                className="h-14 text-base font-medium bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-lg"
                disabled={students.length === 0}
                onClick={handleUpload}
              >
                <Database className="h-5 w-5 mr-2" />
                Upload to Database
              </Button>
            </div>

            <Separator />

            {/* View All Button */}
            <Link href="/scanner/list">
              <Button
                variant="outline"
                size="lg"
                className="w-full h-14 text-base font-medium bg-primary/10 hover:bg-primary/20"
              >
                <Scan className="h-5 w-5 mr-2" />
                View All Students
              </Button>
            </Link>
          </div>
        </div>

        <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-red-500" />
                Clear History
              </AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to clear all student records? This action cannot be undone and will permanently delete all captured student information.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleClear}
                className="bg-red-500 hover:bg-red-600 text-white"
              >
                Clear All Records
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
