import { addDays, format, startOfWeek } from 'date-fns';

export const toMinutes = (hour: string): number => {
  const [h, m] = hour.split(':').map(Number);
  return h * 60 + m;
};

export const toISODate = (date: Date): string => format(date, 'yyyy-MM-dd');

export const weekdayKey = (dateISO: string): string => {
  const date = new Date(`${dateISO}T00:00:00`);
  return format(date, 'EEEE').toLowerCase();
};

export const weekRange = (baseDate = new Date()): string[] => {
  const start = startOfWeek(baseDate, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, index) => toISODate(addDays(start, index)));
};
