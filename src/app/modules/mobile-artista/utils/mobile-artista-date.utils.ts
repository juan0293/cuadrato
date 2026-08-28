import { format } from 'date-fns';

export const todayISO = (): string => format(new Date(), 'yyyy-MM-dd');
export const monthKeyISO = (): string => format(new Date(), 'yyyy-MM');
