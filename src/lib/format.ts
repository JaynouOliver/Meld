export function uid() {
  return "x" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Clock time like "10:31 AM". */
export function clock(d = new Date()) {
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
}

/** Monday-based index of today (0 = Mon). */
export function todayIndex(d?: Date) {
  d ??= new Date();
  return (d.getDay() + 6) % 7;
}

export function plural(n: number, one: string, many = one + "s") {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Timestamp to store on new messages and activity. The server stores ISO time
 * (its clock is UTC); the browser preview stores a display time directly.
 */
export function stamp() {
  return typeof window === "undefined" ? new Date().toISOString() : clock();
}

/** Display form of a stored time: ISO becomes the viewer's local clock; labels pass through. */
export function displayTime(t: string) {
  return /^\d{4}-\d{2}-\d{2}T/.test(t) ? clock(new Date(t)) : t;
}
