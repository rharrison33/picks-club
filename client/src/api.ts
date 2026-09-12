export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch("/api" + path, {
    ...options, credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-Requested-With": "PicksClub", ...options.headers },
  });
  const data = await response.json();
  if (!response.ok) throw new ApiError(response.status, data.error ?? "Request failed.");
  return data as T;
}
export const dollars = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
export function parseFee(value: string): number {
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(value.trim())) throw new Error("Enter a dollar amount with no more than two decimal places.");
  const cents = Math.round(Number(value) * 100);
  if (cents < 1000) throw new Error("The minimum entry amount is $10.");
  if (cents > 250000) throw new Error("The maximum entry amount is $2,500.");
  return cents;
}
export const messageOf = (error: unknown) => error instanceof Error ? error.message : "Something went wrong.";

