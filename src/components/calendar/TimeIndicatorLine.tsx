const TimeIndicatorLine = () => {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-purple-300"
      style={{
        transform: `translateY(${
          (new Date().getHours() + new Date().getMinutes() / 60) * 80
        }px)`,
      }}
    >
      <div className="absolute -top-1 -left-1 h-2 w-2 rounded-full bg-purple-200" />
      <div className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-purple-200" />
    </div>
  );
};

export default TimeIndicatorLine;
