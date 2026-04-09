'use client';

import { createClient } from '@ncthub/supabase/next/client';
import type { Student } from '@ncthub/types/primitives/Student';
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
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@ncthub/ui/card';
import { useToast } from '@ncthub/ui/hooks/use-toast';
import {
  Camera,
  Clock,
  Database,
  FileText,
  Scan,
  Trash2,
  TrendingUp,
  Upload,
  Users,
} from '@ncthub/ui/icons';
import { Separator } from '@ncthub/ui/separator';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import StudentForm from './StudentForm';
import StudentList from './StudentList';
import VideoCapture from './VideoCapture';

export default function ScannerPage() {
  const [newStudent, setNewStudent] = useState<Student | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [whitelisted, setWhitelisted] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const checkWhitelisted = async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          setWhitelisted(false);
          return;
        }

        const { data: workspaces, error: workspaceError } = await supabase
          .from('workspace_members')
          .select('ws_id')
          .eq('user_id', user.id);

        if (workspaceError) {
          console.error('Error fetching workspaces:', workspaceError);
          setWhitelisted(false);
        } else {
          setWhitelisted(workspaces && workspaces.length > 0);
        }
      } catch (error) {
        console.error('Error checking workspace membership:', error);
        setWhitelisted(false);
      }
    };

    checkWhitelisted();
  }, []);

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
    if (!whitelisted) {
      toast({
        title: 'Access Denied',
        description:
          'You must be a member of a workspace to upload students to the database.',
        variant: 'destructive',
      });
      return;
    }

    const uploadPromises = students.map(async (student) => {
      const response = await fetch(`/api/students`, {
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
      });

      if (!response.ok) {
        throw new Error('Failed to upload student');
      }

      return response.json();
    });

    try {
      const results = await Promise.allSettled(uploadPromises);

      const successfulUploads = results.filter(
        (result) => result.status === 'fulfilled'
      );

      const remainingStudents = students.filter((_, index) => {
        const result = results[index];
        return result && result.status === 'rejected';
      });

      setStudents(remainingStudents);

      if (successfulUploads.length > 0) {
        toast({
          title: 'Students Uploaded',
          description: `Successfully uploaded ${successfulUploads.length}/${students.length} student(s)`,
          variant: 'default',
        });
      } else {
        toast({
          title: 'No Students Uploaded',
          description: 'Failed to upload students to database',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error(error);

      toast({
        title: 'Error',
        description: 'Unexpected error occurred',
        variant: 'destructive',
      });
    }
  };

  // Stats calculations
  const todayCount = students.filter(
    (s) => new Date(s.timestamp).toDateString() === new Date().toDateString()
  ).length;

  const thisWeekCount = students.filter((s) => {
    const studentDate = new Date(s.timestamp);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return studentDate >= weekAgo;
  }).length;

  return (
    <div className="container mx-auto min-h-screen px-4">
      {/* Hero Section */}
      <div className="px-4 py-16">
        <div className="space-y-4 text-center">
          <h1 className="bg-linear-to-r from-dynamic-light-blue to-dynamic-blue bg-clip-text font-bold text-4xl text-transparent md:text-6xl">
            NEO Scanner
          </h1>
          <p className="mx-auto max-w-2xl text-dynamic-light-sky text-xl">
            Effortlessly capture and manage student information with our
            AI-powered scanning technology
          </p>
        </div>
      </div>

      <div className="px-4 py-8">
        {/* Stats Cards */}
        <div className="mb-8">
          {/* Mobile stats (stacked rows) */}
          <div className="flex flex-col gap-3 md:hidden">
            <div className="flex items-center justify-between rounded-lg border border-border/20 bg-card/20 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-dynamic-blue/20 text-dynamic-light-blue">
                  <Users className="h-5 w-5" />
                </div>
                <p className="font-medium text-sm">Total Students</p>
              </div>
              <p className="font-bold text-xl">{students.length}</p>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/20 bg-card/20 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-dynamic-green/20 text-dynamic-light-green">
                  <Clock className="h-5 w-5" />
                </div>
                <p className="font-medium text-sm">Today</p>
              </div>
              <p className="font-bold text-xl">{todayCount}</p>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/20 bg-card/20 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-dynamic-purple/20 text-dynamic-light-purple">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <p className="font-medium text-sm">This Week</p>
              </div>
              <p className="font-bold text-xl">{thisWeekCount}</p>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/20 bg-card/20 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-dynamic-orange/20 text-dynamic-light-orange">
                  <Upload className="h-5 w-5" />
                </div>
                <p className="font-medium text-sm">Pending Upload</p>
              </div>
              <p className="font-bold text-xl">{students.length}</p>
            </div>
          </div>

          {/* Desktop stats (grid) */}
          <div className="hidden gap-6 md:grid md:grid-cols-4">
            <Card className="border-0 bg-linear-to-br from-dynamic-blue to-brand-light-blue text-primary-foreground shadow-lg">
              <CardContent className="h-full p-6">
                <div className="flex h-full flex-col justify-between gap-2">
                  <p className="font-medium text-sm">Total Students</p>
                  <div className="flex justify-between">
                    <p className="font-bold text-3xl">{students.length}</p>
                    <Users className="h-8 w-8" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 bg-linear-to-br from-dynamic-green to-dynamic-light-green text-primary shadow-lg">
              <CardContent className="h-full p-6">
                <div className="flex h-full flex-col justify-between gap-2">
                  <p className="font-medium text-sm">Today</p>
                  <div className="flex justify-between">
                    <p className="font-bold text-3xl">{todayCount}</p>
                    <Clock className="h-8 w-8" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 bg-linear-to-br from-dynamic-purple to-dynamic-light-purple text-primary-foreground shadow-lg">
              <CardContent className="h-full p-6">
                <div className="flex h-full flex-col justify-between gap-2">
                  <p className="font-medium text-sm">This Week</p>
                  <div className="flex justify-between">
                    <p className="font-bold text-3xl">{thisWeekCount}</p>
                    <TrendingUp className="h-8 w-8" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 bg-linear-to-br from-dynamic-orange to-brand-light-yellow text-primary shadow-lg">
              <CardContent className="h-full p-6">
                <div className="flex h-full flex-col justify-between gap-2">
                  <p className="font-medium text-sm">Pending Upload</p>
                  <div className="flex justify-between">
                    <p className="font-bold text-3xl">{students.length}</p>
                    <Upload className="h-8 w-8" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Main Content */}
        <div className="space-y-8">
          {/* Student Input Section */}
          <Card className="border-border shadow-xl">
            <CardContent className="grid grid-cols-1 gap-16 px-8 py-6 lg:grid-cols-2">
              {/* Scanner Section */}
              <div className="flex flex-col gap-8">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-linear-to-br from-dynamic-blue to-dynamic-purple p-2">
                    <Camera className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">ID Scanner</CardTitle>
                    <CardDescription>
                      Point camera at student ID to capture information
                    </CardDescription>
                  </div>
                </div>
                <div className="space-y-6">
                  <VideoCapture onNewStudent={handleNewStudent} />
                </div>
              </div>

              {/* Student Form Section */}
              <div className="flex flex-col gap-8">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-linear-to-br from-dynamic-green to-dynamic-light-green p-2">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">
                      Student Information
                    </CardTitle>
                    <CardDescription>
                      Review and complete student details
                    </CardDescription>
                  </div>
                </div>
                <div className="flex-1">
                  <StudentForm
                    values={
                      newStudent
                        ? {
                            name: newStudent.name,
                            studentNumber: newStudent.studentNumber,
                            program: newStudent.program ?? undefined,
                          }
                        : undefined
                    }
                    onSubmit={(data) => {
                      handleAddStudent(
                        data.name,
                        data.studentNumber,
                        data.program ?? null
                      );
                      setNewStudent(null);
                    }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Student List Section */}
          <Card className="border-border shadow-xl">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-linear-to-br from-dynamic-indigo to-dynamic-purple p-2">
                    <Users className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">Student Records</CardTitle>
                    <CardDescription>
                      Manage captured student information
                    </CardDescription>
                  </div>
                </div>
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
            <CardFooter className="flex-col items-stretch gap-4">
              {/* Action Buttons */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Button
                  size="lg"
                  variant="destructive"
                  className="h-14 font-medium text-base shadow-lg"
                  disabled={students.length === 0}
                  onClick={() => setShowClearDialog(true)}
                >
                  <Trash2 className="mr-2 h-5 w-5" />
                  Clear History
                </Button>

                <Button
                  size="lg"
                  className="h-14 bg-linear-to-r from-dynamic-green to-dynamic-light-green font-medium text-base text-primary shadow-lg hover:opacity-90"
                  disabled={students.length === 0 || !whitelisted}
                  onClick={handleUpload}
                >
                  <Database className="mr-2 h-5 w-5" />
                  Upload to Database
                </Button>
              </div>

              <Separator />

              {/* View All Button */}
              <Link href="/scanner/list">
                <Button
                  variant="outline"
                  size="lg"
                  className="h-14 w-full bg-primary/10 font-medium text-base hover:bg-primary/20"
                  disabled={!whitelisted}
                >
                  <Scan className="mr-2 h-5 w-5" />
                  View All Students
                </Button>
              </Link>
            </CardFooter>
          </Card>
        </div>

        <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-destructive" />
                Clear History
              </AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to clear all student records? This action
                cannot be undone and will permanently delete all captured
                student information.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleClear}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
