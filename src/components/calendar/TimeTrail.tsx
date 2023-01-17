const TimeTrail = () => {
  const hours = Array.from(Array(24).keys());

  return (
    <div className="grid w-16 grid-rows-[24]">
      {hours.map((hour, index) => (
        <div
          key={`trail-hour-${index}`}
          className={`relative flex h-20 w-full min-w-fit items-center justify-end text-xl font-semibold ${
            hour === 23 ? 'border-b border-zinc-800' : 'translate-y-3'
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
