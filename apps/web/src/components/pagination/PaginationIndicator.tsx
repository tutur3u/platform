import { Pagination } from '@mantine/core';

interface Props {
  totalItems: number | undefined;
  activePage: number;
  setActivePage: (page: number) => void;
  itemsPerPage: number;
}

const PaginationIndicator = ({
  totalItems,
  activePage,
  setActivePage,
  itemsPerPage,
}: Props) => {
  const totalPages = Math.ceil((totalItems || 0) / itemsPerPage);

  return (
    <div className="flex flex-col items-center justify-between gap-2 py-4 text-center md:flex-row">
      <div className="py-1 text-zinc-400">
        {totalItems != null ? (
          totalItems === 0 ? (
            'Không có kết quả nào.'
          ) : (
            <>
              Đang hiển thị{' '}
              <span className="font-semibold text-zinc-200">
                {activePage * itemsPerPage - itemsPerPage + 1}
              </span>{' '}
              đến{' '}
              <span className="font-semibold text-zinc-200">
                {activePage * itemsPerPage > totalItems
                  ? totalItems
                  : activePage * itemsPerPage}
              </span>{' '}
              trên tổng số{' '}
              <span className="font-semibold text-zinc-200">{totalItems}</span>{' '}
              kết quả.
            </>
          )
        ) : (
          'Đang tải...'
        )}
      </div>

      <Pagination
        value={activePage}
        onChange={setActivePage}
        total={totalPages}
        noWrap
      />
    </div>
  );
};

export default PaginationIndicator;
