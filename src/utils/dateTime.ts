const pad2 = (n: number) => String(n).padStart(2, "0");

export function currentLocalDate(date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function currentLocalTime(date = new Date()): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function currentLocalDateTime(date = new Date()): string {
  return `${currentLocalDate(date)} ${currentLocalTime(date)}`;
}
