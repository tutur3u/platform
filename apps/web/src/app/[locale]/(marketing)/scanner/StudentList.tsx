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
import { Badge } from '@ncthub/ui/badge';
import { Button } from '@ncthub/ui/button';
import { Card, CardContent } from '@ncthub/ui/card';
import { useToast } from '@ncthub/ui/hooks/use-toast';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Pencil,
  Save,
  Search,
  Trash2,
  UserPlus,
  X,
} from '@ncthub/ui/icons';
import { Input } from '@ncthub/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ncthub/ui/table';
import { cn } from '@ncthub/utils/format';
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
  const [showFilters, setShowFilters] = useState(false);
  const { toast } = useToast();

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

  const itemsPerPage = 8;
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
          `${item.name},${item.studentNumber},${
            item.program
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
    const filename = `students_${timestamp}.csv`;
    const a = document.createElement('a');

    a.setAttribute('href', url);
    a.setAttribute('download', filename);
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: 'Export Successful',
      description: 'Student data has been exported to CSV file',
    });
  };

  const clearFilters = () => {
    setStartDate(null);
    setEndDate(null);
    setSearchTerm('');
    onDateRangeApply(null, null);
  };

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex justify-end">
        <div className="flex items-center gap-4">
          <AddStudentDialog
            trigger={
              <Button className="bg-blue-500 shadow-lg hover:bg-blue-600">
                <UserPlus className="mr-2 h-4 w-4" />
                Add Manually
              </Button>
            }
            onAdd={onAdd}
          />
          <Button
            onClick={exportToCSV}
            variant="outline"
            disabled={currentItems.length === 0}
            className="shadow-lg"
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <Card className="border-0 bg-background/80 shadow-lg">
        <CardContent className="p-6">
          <div className="space-y-4">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 transform text-gray-400" />
              <Input
                placeholder="Search by name, student number, or program..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-12 border-2 pl-10 text-base focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20"
              />
              {searchTerm && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSearchTerm('')}
                  className="absolute top-1/2 right-2 h-8 w-8 -translate-y-1/2 transform p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Filter Toggle */}
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2"
              >
                <Filter className="h-4 w-4" />
                Date Filters
                {(startDate || endDate) && (
                  <Badge variant="secondary" className="ml-1">
                    Active
                  </Badge>
                )}
              </Button>

              {(startDate || endDate || searchTerm) && (
                <Button
                  variant="ghost"
                  onClick={clearFilters}
                  className="text-gray-500 hover:text-gray-700"
                >
                  Clear All Filters
                </Button>
              )}
            </div>

            {/* Date Filters */}
            {showFilters && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <Calendar className="h-4 w-4" />
                    Start Date
                  </label>
                  <DatePicker
                    date={startDate}
                    setDate={setStartDate}
                    placeholder="Select start date"
                  />
                </div>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <Calendar className="h-4 w-4" />
                    End Date
                  </label>
                  <DatePicker
                    date={endDate}
                    setDate={setEndDate}
                    placeholder="Select end date"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={() => onDateRangeApply(startDate, endDate)}
                    disabled={!startDate && !endDate}
                    className="w-full bg-green-500 hover:bg-green-600"
                  >
                    Apply Filters
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results Summary */}
      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>
          Showing {currentItems.length} of {sortedItems.length} students
          {searchTerm && (
            <span className="ml-1">
              matching "<strong>{searchTerm}</strong>"
            </span>
          )}
        </span>
        {sortedItems.length > itemsPerPage && (
          <span>
            Page {currentPage} of {totalPages}
          </span>
        )}
      </div>

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
                  <TableCell className="flex gap-2 px-4 py-2">
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            onClick={prevPage}
            disabled={currentPage === 1}
            className="flex items-center gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>

          <div className="flex items-center gap-2">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pageNum = i + 1;
              const actualPage =
                currentPage <= 3
                  ? pageNum
                  : currentPage >= totalPages - 2
                    ? totalPages - 4 + pageNum
                    : currentPage - 2 + pageNum;

              if (actualPage < 1 || actualPage > totalPages) return null;

              return (
                <Button
                  key={actualPage}
                  variant={currentPage === actualPage ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setCurrentPage(actualPage)}
                  className={cn(
                    'h-10 w-10',
                    currentPage === actualPage &&
                      'bg-blue-500 hover:bg-blue-600'
                  )}
                >
                  {actualPage}
                </Button>
              );
            })}
          </div>

          <Button
            variant="outline"
            onClick={nextPage}
            disabled={currentPage === totalPages}
            className="flex items-center gap-2"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-500" />
              Delete Student Record
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this student record? This action
              cannot be undone and will permanently remove all associated
              information.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleDelete(deleteID)}
              className="bg-red-500 text-white hover:bg-red-600"
            >
              Delete Record
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
