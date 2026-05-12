const BASE_PATH =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_BASE_PATH) ?? "/nextjs";

export function apiUrl(path: string): string {
  return `${BASE_PATH}/api${path}`;
}
