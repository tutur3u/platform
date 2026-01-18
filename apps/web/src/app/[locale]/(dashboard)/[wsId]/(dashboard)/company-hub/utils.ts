import {
  type CountdownTime,
  dayjs,
  FOUNDING_DATE,
  QUARTERS,
  type YearInfo,
} from './types';

export function calculateYearInfo(): YearInfo {
  const now = dayjs();
  const currentMonth = now.month() + 1;
  const currentDay = now.date();
  const fiscalYear = currentMonth === 1 ? now.year() - 1 : now.year();
  const isJanuary = currentMonth === 1;

  let currentQuarter: YearInfo['currentQuarter'] = 'january';
  let quarterIndex = -1;

  if (!isJanuary) {
    for (let i = 0; i < QUARTERS.length; i++) {
      const quarterMonths = QUARTERS[i]!.months as readonly number[];
      if (quarterMonths.includes(currentMonth)) {
        currentQuarter = QUARTERS[i]!.id;
        quarterIndex = i;
        break;
      }
    }
  } else {
    currentQuarter = 'q4';
    quarterIndex = 3;
  }

  const quarter = QUARTERS[quarterIndex === -1 ? 3 : quarterIndex];
  const quarterStartMonth = quarter?.startMonth ?? 2;
  let quarterStartDate = dayjs()
    .year(fiscalYear)
    .month(quarterStartMonth - 1)
    .date(1)
    .startOf('day');

  if (currentMonth === 1) {
    quarterStartDate = quarterStartDate.year(fiscalYear).month(10);
  }

  let quarterEndDate = quarterStartDate;
  if (quarterIndex === 3) {
    quarterEndDate = dayjs()
      .year(fiscalYear + 1)
      .month(1)
      .date(1)
      .startOf('day');
  } else {
    quarterEndDate = quarterStartDate.add(3, 'month');
  }

  const totalDaysInQuarter = quarterEndDate.diff(quarterStartDate, 'day');
  const totalWeeksInQuarter = Math.ceil(totalDaysInQuarter / 7);
  const daysSinceQuarterStart = now.diff(quarterStartDate, 'day');
  const weekInQuarter = Math.floor(daysSinceQuarterStart / 7) + 1;

  const fyStart = dayjs().year(fiscalYear).month(1).date(1).startOf('day');
  const fyEnd = dayjs()
    .year(fiscalYear + 1)
    .month(1)
    .date(1)
    .startOf('day');
  const totalDays = fyEnd.diff(fyStart, 'day');
  const daysPassed = now.diff(fyStart, 'day');
  const progressPercent = Math.min(
    100,
    Math.max(0, (daysPassed / totalDays) * 100)
  );
  const daysRemaining = Math.max(0, totalDays - daysPassed);

  const isBirthday = currentMonth === 6 && currentDay === 20;
  const thisYearBirthday = dayjs().month(5).date(20).startOf('day');
  let nextBirthday = thisYearBirthday;
  if (now.isAfter(thisYearBirthday) && !isBirthday) {
    nextBirthday = thisYearBirthday.add(1, 'year');
  }
  const daysUntilBirthday = isBirthday ? 0 : nextBirthday.diff(now, 'day') + 1;

  const isYearEndPartyMonth = currentMonth === 12;
  const isYearEndPartyPassed = currentMonth === 1;
  const thisYearDecember = dayjs().month(11).date(1).startOf('day');
  let nextYearEndParty = thisYearDecember;
  if (now.isAfter(thisYearDecember) && currentMonth !== 12) {
    nextYearEndParty = thisYearDecember.add(1, 'year');
  }
  const daysUntilYearEndParty = isYearEndPartyMonth
    ? 0
    : nextYearEndParty.diff(now, 'day') + 1;

  const ageDuration = dayjs.duration(now.diff(FOUNDING_DATE));
  const ageYears = Math.floor(ageDuration.asYears());
  const ageMonths = Math.floor(ageDuration.asMonths() % 12);
  const ageDays = Math.floor(ageDuration.asDays() % 30);

  return {
    fiscalYear,
    currentQuarter: isJanuary ? 'january' : currentQuarter,
    quarterIndex,
    progressPercent,
    daysRemaining,
    daysPassed,
    weekInQuarter,
    totalWeeksInQuarter,
    isJanuary,
    isBirthday,
    daysUntilBirthday,
    isYearEndPartyMonth,
    isYearEndPartyPassed,
    daysUntilYearEndParty,
    companyAge: { years: ageYears, months: ageMonths, days: ageDays },
    currentMonth,
    currentDay,
  };
}

export function calculateTetCountdown(): CountdownTime | null {
  const milestoneDate = dayjs.tz('2026-02-17 00:00:00', 'Asia/Ho_Chi_Minh');
  const now = dayjs();
  const diff = milestoneDate.diff(now);

  if (diff > 0) {
    const dur = dayjs.duration(diff);
    return {
      days: Math.floor(dur.asDays()),
      hours: dur.hours(),
      minutes: dur.minutes(),
      seconds: dur.seconds(),
    };
  }
  return null;
}

export function calculateJapanCountdown(): CountdownTime | null {
  const milestoneDate = dayjs.tz('2026-12-31 23:59:59', 'Asia/Ho_Chi_Minh');
  const now = dayjs();
  const diff = milestoneDate.diff(now);

  if (diff > 0) {
    const dur = dayjs.duration(diff);
    return {
      days: Math.floor(dur.asDays()),
      hours: dur.hours(),
      minutes: dur.minutes(),
      seconds: dur.seconds(),
    };
  }
  return null;
}

export function calculateBirthdayCountdown(): {
  countdown: CountdownTime | null;
  nextAge: number;
  isBirthday: boolean;
} {
  const now = dayjs();
  const thisYearBirthday = dayjs.tz(
    `${now.year()}-06-20 00:00:00`,
    'Asia/Ho_Chi_Minh'
  );
  const nextYearBirthday = dayjs.tz(
    `${now.year() + 1}-06-20 00:00:00`,
    'Asia/Ho_Chi_Minh'
  );
  const isBirthday = now.month() === 5 && now.date() === 20;
  const currentAge = now.diff(FOUNDING_DATE, 'year');
  let targetBirthday = thisYearBirthday;
  if (now.isAfter(thisYearBirthday) && !isBirthday) {
    targetBirthday = nextYearBirthday;
  }
  const diff = targetBirthday.diff(now);
  if (diff > 0 || isBirthday) {
    if (isBirthday) {
      return {
        countdown: { days: 0, hours: 0, minutes: 0, seconds: 0 },
        nextAge: currentAge,
        isBirthday: true,
      };
    }
    const dur = dayjs.duration(diff);
    return {
      countdown: {
        days: Math.floor(dur.asDays()),
        hours: dur.hours(),
        minutes: dur.minutes(),
        seconds: dur.seconds(),
      },
      nextAge: currentAge + 1,
      isBirthday: false,
    };
  }
  return { countdown: null, nextAge: currentAge + 1, isBirthday: false };
}

export function calculateChristmasLaunchCountdown(): CountdownTime | null {
  const milestoneDate = dayjs.tz('2026-12-15 00:00:00', 'Asia/Ho_Chi_Minh');
  const now = dayjs();
  const diff = milestoneDate.diff(now);
  if (diff > 0) {
    const dur = dayjs.duration(diff);
    return {
      days: Math.floor(dur.asDays()),
      hours: dur.hours(),
      minutes: dur.minutes(),
      seconds: dur.seconds(),
    };
  }
  return null;
}
