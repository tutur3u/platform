const TimeTrail = () => {
  const hours = Array.from(Array(24).keys());

  return (
    <div className="grid h-fit w-20 grid-rows-[24] border-r border-zinc-300 dark:border-zinc-800">
      {hours.map((hour, index) => (
        <div
          key={`trail-hour-${index}`}
          className={`relative flex h-20 w-full min-w-fit items-center justify-end text-xl font-semibold ${
            hour !== 23 && 'translate-y-3'
          }`}
        >
          <span className="absolute bottom-0 right-0 px-2">
            {hour < 23 ? hour + 1 + ':00' : null}
          </span>
        </div>
      ))}
    </div>
  );
};

export default TimeTrail;
