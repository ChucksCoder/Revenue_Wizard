export function fmtMoney(x: number | string | null | undefined): string {
  const n = typeof x === "string" ? parseFloat(x) : x ?? 0;
  if (isNaN(n)) return "-";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtMoney0(x: number | string | null | undefined): string {
  const n = typeof x === "string" ? parseFloat(x) : x ?? 0;
  if (isNaN(n)) return "-";
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function fmtDate(s: string | null | undefined): string {
  if (!s) return "-";
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${m}/${d}/${y}`;
}

export function num(x: string | number | null | undefined): number {
  if (x == null) return 0;
  const n = typeof x === "string" ? parseFloat(x) : x;
  return isNaN(n) ? 0 : n;
}
