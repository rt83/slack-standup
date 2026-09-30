/** A submission time as the team reads it: in the team's zone, e.g. "Sep 29, 9:05 AM". */
export function formatSubmittedAt(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
