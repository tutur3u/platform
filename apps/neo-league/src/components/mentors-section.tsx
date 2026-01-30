export function MentorsSection() {
  const mentors = [
    {
      name: 'DR. BYRON MASON',
      field: 'Robotics & Mechatronics Engineering',
    },
    {
      name: 'DR. DINH-SON VU',
      field: 'Robotics & Mechatronics Engineering',
    },
    {
      name: 'DR. HUNG PHAM VIET',
      field: 'Electronic Computer Systems & Robotics',
    },
    { name: 'DR. GINEL DORLEON', field: 'Artificial Intelligence' },
    { name: 'DR. MINH VU', field: 'Information Technology' },
    {
      name: 'DR. THANH TRAN',
      field: 'Electronic & Computer Systems Engineering',
    },
    { name: 'DR. LINH TRAN', field: 'Software Engineering' },
    { name: 'DR. HOANG PHAN', field: 'Food Technology & Nutrition' },
  ];

  return (
    <section
      id="mentors"
      className="bg-secondary/10 px-6 py-20 md:px-8 md:py-24 dark:bg-secondary/5"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <h2 className="mb-4 font-black text-3xl md:text-4xl">
            MENTORS & <span className="text-secondary">JUDGES</span>
          </h2>
          <p className="mx-auto max-w-2xl font-bold text-foreground text-lg">
            Learn from and be evaluated by distinguished faculty from RMIT
            School of Science, Engineering & Technology.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {mentors.map((mentor, index) => (
            <div
              key={index}
              className="glass-card card-hover rounded-xl p-6 text-center"
            >
              <div className="gradient-bg mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full font-black text-2xl text-white">
                {mentor.name.split(' ').pop()?.charAt(0)}
              </div>
              <h4 className="mb-1 font-black">{mentor.name}</h4>
              <p className="text-foreground text-sm">{mentor.field}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
