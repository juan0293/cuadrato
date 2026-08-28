export const isEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export const requiredText = (value: string | null | undefined): boolean =>
  !!value && value.trim().length > 0;
