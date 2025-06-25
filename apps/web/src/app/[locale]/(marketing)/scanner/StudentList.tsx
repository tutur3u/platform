import AddStudentDialog from './AddStudentDialog';
import { DatePicker } from './DatePicker';
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
import { Pencil, Save, Trash2 } from '@ncthub/ui/icons';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ncthub/ui/table';
import React, { useState } from 'react';

interface StudentListProps {
  students: Student[];
  onAdd: (name: string, studentNumber: string, program: string) => void;
  onUpdate: (updatedStudent: Student) => void;
  onDelete: (id: string) => void;
  onDateRangeApply: (startDate: Date | null, endDate: Date | null) => void;
}

export default function StudentList({
  students,
  onAdd,
  onUpdate,
  onDelete,
  onDateRangeApply,
}: StudentListProps) {
  const [editID, setEditID] = useState<string | null>(null);
  const [deleteID, setDeleteID] = useState<string | null>(null);
  const [editName, setEditName] = useState<string | null>(null);
  const [editStudentNumber, setEditStudentNumber] = useState<string | null>(
    null
  );
  const [editProgram, setEditProgram] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleEdit = (id: string) => {
    const student = students.find((s) => s.id === id);
    if (!student) return;

    setEditID(id);
    setEditName(student.name);
    setEditStudentNumber(student.studentNumber);
    setEditProgram(student.program);
  };

  const handleSave = () => {
    if (!editID) return;

    const oldStudent = students.find((s) => s.id === editID);
    if (!oldStudent) return;

    const updatedStudent = {
      ...oldStudent,
      name: editName ?? '',
      studentNumber: editStudentNumber ?? '',
      program: editProgram ?? '',
    };

    onUpdate(updatedStudent);

    setEditID(null);
    setEditName(null);
    setEditStudentNumber(null);
    setEditProgram(null);
  };

  const handleDelete = (id: string | null) => {
    if (id) onDelete(id);
  };

  const filteredItems = students.filter((item) => {
    const nameMatch = item.name
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const studentNumberMatch = item.studentNumber
      .toString()
      .includes(searchTerm);
    const programMatch = item.program
      ? item.program.toLowerCase().includes(searchTerm.toLowerCase())
      : false;
    return nameMatch || studentNumberMatch || programMatch;
  });

  const sortedItems = filteredItems.sort((a, b) => {
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  const itemsPerPage = 10;
  const totalPages = Math.ceil(sortedItems.length / itemsPerPage);
  const currentItems = sortedItems.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const nextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const prevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const exportToCSV = () => {
    const headers = ['Name', 'Student Number', 'Program', 'Timestamp'];

    const formatDate = (date: Date | null) => {
      return date ? date.toISOString().split('T')[0] : '';
    };

    const csvRows = [
      `Date Range: ${startDate ? formatDate(startDate) : 'Previous'}
      to ${endDate ? formatDate(endDate) : 'Now'}`,
      headers.join(','),
      ...students.map(
        (item) =>
          `${item.name},${item.studentNumber},${item.program
          },"${item.timestamp.toLocaleString()}"`
      ),
    ];

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const filename = `${timestamp}.csv`;
    const a = document.createElement('a');

    a.setAttribute('href', url);
    a.setAttribute('download', filename);
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: 'CSV Exported',
      description: 'CSV file has been downloaded successfully',
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-primary">Student List</h2>
        <div className="flex gap-2">
          <AddStudentDialog
            trigger={
              <Button className="rounded-lg px-4 py-2 transition">
                Add Manually
              </Button>
            }
            onAdd={onAdd}
          />

          <Button
            onClick={exportToCSV}
            className={`rounded-lg px-4 py-2 ${currentItems.length === 0 && 'opacity-50'
              }`}
            disabled={currentItems.length === 0}
          >
            Export to CSV
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 p-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Start Date:</span>
          <DatePicker
            date={startDate}
            setDate={setStartDate}
            placeholder="Select start date"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">End Date:</span>
          <DatePicker
            date={endDate}
            setDate={setEndDate}
            placeholder="Select end date"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setStartDate(null);
              setEndDate(null);
              onDateRangeApply(null, null);
            }}
          >
            Clear
          </Button>
          <Button
            onClick={() => {
              onDateRangeApply(startDate, endDate);
            }}
            disabled={!startDate && !endDate}
          >
            Apply
          </Button>
        </div>
      </div>

      <input
        type="text"
        placeholder="Search by name, ID, or program..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full rounded-lg border p-2 focus:ring-2 focus:ring-[#4896ac] focus:outline-hidden"
      />

      <div className="overflow-x-auto">
        <Table className="min-w-full overflow-hidden rounded-lg bg-primary-foreground">
          <TableHeader className="bg-secondary">
            <TableRow>
              <TableHead className="px-4 py-2 text-center">Name</TableHead>
              <TableHead className="px-4 py-2 text-center">
                Student Number
              </TableHead>
              <TableHead className="px-4 py-2 text-center">Program</TableHead>
              <TableHead className="px-4 py-2 text-center">Timestamp</TableHead>
              <TableHead className="px-4 py-2 text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentItems.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-4 text-center text-gray-500"
                >
                  No records found
                </TableCell>
              </TableRow>
            ) : (
              currentItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="px-4 py-2">
                    {editID === item.id ? (
                      <input
                        type="text"
                        value={editName ?? ''}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full rounded-sm border p-1"
                      />
                    ) : (
                      item.name
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-2">
                    {editID === item.id ? (
                      <input
                        type="text"
                        value={editStudentNumber ?? ''}
                        onChange={(e) => setEditStudentNumber(e.target.value)}
                        className="w-full rounded-sm border p-1"
                      />
                    ) : (
                      item.studentNumber
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-2">
                    {editID === item.id ? (
                      <input
                        type="text"
                        value={editProgram ?? ''}
                        onChange={(e) => setEditProgram(e.target.value)}
                        className="w-full rounded-sm border p-1"
                      />
                    ) : (
                      item.program
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-2">
                    {item.timestamp.toLocaleString()}
                  </TableCell>
                  <TableCell className="px-4 py-2 flex gap-2">
                    {editID === item.id ? (
                      <Button
                        variant="ghost"
                        onClick={handleSave}
                        className="text-green-500"
                      >
                        <Save className="h-5 w-5" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        onClick={() => handleEdit(item.id)}
                        className="text-blue-500"
                      >
                        <Pencil className="h-5 w-5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setShowDeleteDialog(true);
                        setDeleteID(item.id);
                      }}
                      className="text-red-500"
                    >
                      <Trash2 className="h-5 w-5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex justify-center space-x-2">
          <Button
            onClick={prevPage}
            disabled={currentPage === 1}
            className={`rounded-lg px-4 py-2 ${currentPage === 1 ? 'bg-gray-300' : 'text-white'
              }`}
          >
            Previous
          </Button>
          <span className="px-4 py-2">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            onClick={nextPage}
            disabled={currentPage === totalPages}
            className={`rounded-lg px-4 py-2 ${currentPage === totalPages ? 'bg-gray-300' : 'text-white'
              }`}
          >
            Next
          </Button>
        </div>
      )}

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Record</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this record? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleDelete(deleteID)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
