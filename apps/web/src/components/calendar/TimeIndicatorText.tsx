const TimeIndicatorText = () => {
  const now = new Date();

  const hours = now.getHours();
  const minutes = now.getMinutes();

  const totalHours = hours + minutes / 60;
  const displayable = minutes > 10 && minutes < 48;

  if (displayable)
    return (
      <div
        className="pointer-events-none absolute top-0 -left-9 text-xs font-semibold text-purple-500 dark:text-purple-200"
        style={{
          transform: `translateY(${totalHours * 80 - 8}px)`,
        }}
      >
        {hours + ':' + minutes}
      </div>
    );

  // If the minutes are not between 10 and 48,
  // then we don't want to display the time
  return null;
};

export default TimeIndicatorText;
