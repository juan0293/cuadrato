import { format, startOfDay, endOfDay } from 'date-fns';

export const toDayRange = (date: Date) => ({
  start: startOfDay(date),
  end: endOfDay(date),
});

export const formatDateLabel = (date: Date, pattern = 'yyyy-MM-dd'): string =>
  format(date, pattern);
