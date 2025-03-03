const TimeIndicatorLine = () => {
  const now = new Date();

  const hours = now.getHours();
  const minutes = now.getMinutes();

  const totalHours = hours + minutes / 60;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-purple-500 dark:bg-purple-200"
      style={{
        transform: `translateY(${totalHours * 80}px)`,
      }}
    >
      <div className="absolute -top-1 -left-1 h-2 w-2 rounded-full bg-purple-500 dark:bg-purple-200" />
      <div className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-purple-500 dark:bg-purple-200" />
    </div>
  );
};

export default TimeIndicatorLine;
