const today = new Date();
// Format date as DD/MM/YYYY
const formatDate = (date: Date) => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are zero-based
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

// Mock certificate data
export const mockCertificates = [
  {
    courseName: 'Teaching with AI: A Practical Guide from the Trenches',
    courseLecturer: 'Dr. Tran Duc Linh',
    studentName: 'Tôn Thất Hữu Luân',
    completionDate: formatDate(today),
    certificateId: 'CERT-2023-10-01-d3c4f4be-7b44-432b-8fe3-b8bcd3a3c2d5',
  },
  {
    courseName: 'Advanced Machine Learning Applications',
    courseLecturer: 'Dr. Sarah Johnson',
    studentName: 'John Smith',
    completionDate: formatDate(today),
    certificateId: 'CERT-2024-03-15-a1b2c3d4-e5f6-4321-9876-123456789abc',
  },
  {
    courseName: 'Web Development Masterclass',
    courseLecturer: 'Prof. David Chen',
    studentName: 'Maria Garcia',
    completionDate: formatDate(today),
    certificateId: 'CERT-2024-04-20-98765432-abcd-efgh-ijkl-mnopqrstuvwx',
  },
];
