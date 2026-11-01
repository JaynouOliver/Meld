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
