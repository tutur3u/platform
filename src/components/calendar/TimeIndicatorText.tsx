const TimeIndicatorText = () => {
  const now = new Date();
  const minutes = now.getMinutes();

  return minutes > 10 && minutes < 48 ? (
    <div
      className="pointer-events-none absolute top-0 -left-9 text-xs font-semibold text-purple-300"
      style={{
        transform: `translateY(${
          (new Date().getHours() + minutes / 60) * 80 - 8
        }px)`,
      }}
    >
      {new Date().getHours() + ':' + minutes}
    </div>
  ) : null;
};

export default TimeIndicatorText;
