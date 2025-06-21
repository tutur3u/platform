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
import React, { useState } from 'react';

interface StudentListProps {
  students: Student[];
  editID: string | null;
  editName: string;
  editStudentNumber: string;
  editProgram: string;
  setEditName: (name: string) => void;
  setEditStudentNumber: (number: string) => void;
  setEditProgram: (program: string) => void;
  handleAdd: () => void;
  handleEdit: (id: string) => void;
  handleSave: () => void;
  handleDelete: (id: string) => void;
  handleDateRangeApply?: (startDate: Date | null, endDate: Date | null) => void;
}

const StudentList: React.FC<StudentListProps> = ({
  students,
  editID,
  editName,
  editStudentNumber,
  editProgram,
  setEditName,
  setEditStudentNumber,
  setEditProgram,
  handleAdd,
  handleEdit,
  handleSave,
  handleDelete,
  handleDateRangeApply,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

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
    <>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">Student List</h2>
        <div className="flex gap-2">
          <button
            onClick={handleAdd}
            className="rounded-lg bg-[#4896ac] px-4 py-2 text-white transition hover:bg-[#326979]"
          >
            Add Manually
          </button>

          <button
            onClick={exportToCSV}
            className={`rounded-lg bg-[#4896ac] px-4 py-2 text-white ${
              currentItems.length === 0
                ? 'cursor-not-allowed opacity-50'
                : 'transition hover:bg-[#326979]'
            }`}
            disabled={currentItems.length === 0}
          >
            Export to CSV
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-4 p-4">
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
            onClick={() => {
              setStartDate(null);
              setEndDate(null);
              if (handleDateRangeApply) {
                handleDateRangeApply(null, null);
              }
            }}
            variant="outline"
          >
            Clear
          </Button>
          <Button
            onClick={() => {
              if (handleDateRangeApply) {
                handleDateRangeApply(startDate, endDate);
              }
            }}
            className="bg-[#4896ac] text-white hover:bg-[#326979]"
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
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          setSearchTerm(e.target.value)
        }
        className="mb-4 w-full rounded-lg border p-2 focus:ring-2 focus:ring-[#4896ac] focus:outline-hidden"
      />

      <div className="overflow-x-auto">
        <table className="min-w-full overflow-hidden rounded-lg bg-white">
          <thead className="bg-[#4896ac] text-white">
            <tr>
              <th className="px-4 py-2 text-center">Name</th>
              <th className="px-4 py-2 text-center">Student Number</th>
              <th className="px-4 py-2 text-center">Program</th>
              <th className="px-4 py-2 text-center">Timestamp</th>
              <th className="px-4 py-2 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {currentItems.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-4 text-center text-gray-500">
                  No records found
                </td>
              </tr>
            ) : (
              currentItems.map((item) => (
                <tr
                  key={item.id}
                  className="border-b transition hover:bg-gray-50"
                >
                  <td className="px-4 py-2">
                    {editID === item.id ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setEditName(e.target.value)
                        }
                        className="w-full rounded-sm border p-1"
                      />
                    ) : (
                      item.name
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {editID === item.id ? (
                      <input
                        type="text"
                        value={editStudentNumber}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setEditStudentNumber(e.target.value)
                        }
                        className="w-full rounded-sm border p-1"
                      />
                    ) : (
                      item.studentNumber
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {editID === item.id ? (
                      <input
                        type="text"
                        value={editProgram}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setEditProgram(e.target.value)
                        }
                        className="w-full rounded-sm border p-1"
                      />
                    ) : (
                      item.program
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {item.timestamp.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {editID === item.id ? (
                      <button
                        onClick={handleSave}
                        className="mr-2 text-green-500 hover:text-green-700"
                      >
                        <Save className="h-5 w-5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleEdit(item.id)}
                        className="mr-2 text-blue-500 hover:text-blue-700"
                      >
                        <Pencil className="h-5 w-5" />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setShowDeleteDialog(true);
                        setDeleteId(item.id);
                      }}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex justify-center space-x-2">
          <button
            onClick={prevPage}
            disabled={currentPage === 1}
            className={`rounded-lg px-4 py-2 ${
              currentPage === 1
                ? 'bg-gray-300'
                : 'bg-[#4896ac] text-white hover:bg-[#326979]'
            }`}
          >
            Previous
          </button>
          <span className="px-4 py-2">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={nextPage}
            disabled={currentPage === totalPages}
            className={`rounded-lg px-4 py-2 ${
              currentPage === totalPages
                ? 'bg-gray-300'
                : 'bg-[#4896ac] text-white hover:bg-[#326979]'
            }`}
          >
            Next
          </button>
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
            <AlertDialogAction
              className="bg-[#4896ac] text-white hover:bg-[#326979]"
              onClick={() => {
                if (deleteId) {
                  handleDelete(deleteId);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default StudentList;
