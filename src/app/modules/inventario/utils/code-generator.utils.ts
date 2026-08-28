export function getNextSequentialCode(codes: string[]): string {
  const max = codes
    .map((code) => String(code || '').trim())
    .filter((code) => /^\d+$/.test(code))
    .map((code) => Number(code))
    .reduce((acc, value) => (value > acc ? value : acc), 0);

  return String(max + 1 || 1);
}
