export function formatNumber(num: number): string {
  if (num === 0) return "0";

  if (Math.abs(num) < 1) {
    // Show up to 8 decimal places but trim trailing zeros
    return parseFloat(num.toFixed(8)).toString();
  }

  return num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatAddress(address: string): string {
  return `${address.substring(0, 12)}...`;
}

export function formatTimestamp(time: string): string {
  const date = new Date(time);
  const now = new Date();
  const diffSeconds = (now.getTime() - date.getTime()) / 1000;

  if (diffSeconds < 5) {
    return "just now";
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}
