const TimeTrail = () => {
  const hours = Array.from(Array(24).keys());

  return (
    <div className="grid h-fit w-14 grid-rows-[24] border-r border-border md:w-20 dark:border-zinc-800">
      {hours.map((hour, index) => (
        <div
          key={`trail-hour-${index}`}
          className={`relative flex h-20 w-full min-w-fit items-center justify-end text-sm font-semibold md:text-xl ${
            hour !== 23 && 'translate-y-3'
          }`}
        >
          <span className="absolute right-0 bottom-0 px-2">
            {hour < 23 ? hour + 1 + ':00' : null}
          </span>
        </div>
      ))}
    </div>
  );
};

export default TimeTrail;
