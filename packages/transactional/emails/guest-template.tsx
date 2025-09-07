import { Head, Html, Img, Tailwind } from '@tuturuuu/transactional/react/email';

interface Props {
  studentName?: string;
  className?: string;
  teacherName?: string;
  avgScore?: number;
  comments?: string;
}

const TestResultReportEmail = ({
  studentName = '<Tên học sinh>',
  className = '<Tên lớp>',
  teacherName = '<Tên giáo viên>',
  avgScore,
  comments = '',
}: Props) => {
  return (
    <Html>
      <Head />
      <Tailwind>
        <div className="m-4 rounded-lg border bg-white p-6 font-sans text-[14px] text-black leading-6">
          {/* Header */}
          <div className="text-center">
            <Img
              src="https://tuturuuu.com/media/logos/easy.png"
              width="100"
              height="38"
              alt="Easy Logo"
              className="mx-auto"
            />
            <div className="mt-2 font-bold text-lg">
              EASY APPLIED LANGUAGE CENTER
            </div>
            <div className="text-sm">
              CƠ SỞ 1: 24 TRƯỜNG SA - PHƯỚC LONG - NHA TRANG <br />
              CƠ SỞ 2: 03-29 KĐT MIPECO - VĨNH NGUYÊN - NHA TRANG
            </div>
            <div className="mt-1 text-sm">(0258) 6 557 457 - 0977 183 161</div>
          </div>

          {/* Title */}
          <div className="mt-4 text-center font-bold text-blue-700 text-lg uppercase">
            BÁO CÁO KẾT QUẢ HỌC THỬ
          </div>

          {/* Greeting */}
          <p className="mt-4">
            Kính gửi Quý phụ huynh thân thương của Trung tâm Ngoại ngữ EASY,
            <br />
            Dưới đây là bảng đánh giá năng lực tiếng Anh của bạn:{' '}
            <b>{studentName}</b> sau 2 buổi học thử lớp <b>{className}</b> do:{' '}
            <b>{teacherName}</b> chủ nhiệm.
          </p>

          {/* Comments + Score Table */}
          <table className="mt-4 w-full border-collapse border border-black text-sm">
            <thead>
              <tr>
                <th className="w-[70%] border border-black p-2 text-center">
                  NHẬN XÉT
                </th>
                <th className="w-[30%] border border-black p-2 text-center">
                  Điểm trung bình <br /> (trên thang điểm 100)
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="whitespace-pre-line border border-black p-4 align-top">
                  {comments ||
                    '...........................................................'}
                </td>
                <td className="border border-black p-4 text-center align-top">
                  {avgScore !== undefined ? avgScore : '...'}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Footer Note */}
          <p className="mt-4 text-sm">
            Đây là cơ hội để EASY được chia sẻ với Quý phụ huynh về năng lực
            hiện tại của các con trong việc học tiếng Anh. Rất mong nhận được
            đánh giá góp ý thêm từ Quý phụ huynh, để EASY sẽ cố gắng phát huy
            thêm những ưu điểm và ngày càng hoàn thiện việc giảng dạy của mình.
            Trung tâm cũng xin được gửi lời tri ân vì sự tin cậy của Quý phụ
            huynh và học viên./.
          </p>

          {/* Signature */}
          <div className="mt-6 text-right font-semibold">
            Giám đốc
            <br />
            Phạm Thị Thanh Trà
          </div>
        </div>
      </Tailwind>
    </Html>
  );
};

export default TestResultReportEmail;
