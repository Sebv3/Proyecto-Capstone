export function currentEarningsMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit',
  }).formatToParts(now);
  return `${parts.find((p) => p.type === 'year')!.value}-${parts.find((p) => p.type === 'month')!.value}`;
}
export function shiftEarningsMonth(month: string, delta: number): string {
  const [year, number] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, number - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}
export function earningsMonthLabel(month: string): string {
  return new Intl.DateTimeFormat('es-CL', { timeZone: 'UTC', month: 'long', year: 'numeric' })
    .format(new Date(`${month}-01T12:00:00Z`));
}
const earningsMoneyFormat = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
export function earningsMoney(amount: number): string {
  return earningsMoneyFormat.format(amount);
}
