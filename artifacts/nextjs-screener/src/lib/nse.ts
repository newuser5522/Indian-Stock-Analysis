/**
 * NSE India API helper — establishes a browser-like session before each call.
 * NSE requires cookies set from the homepage to accept API requests.
 */

export const NSE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Connection: "keep-alive",
  Referer: "https://www.nseindia.com/",
};

/** Establish NSE session cookie string */
async function getNseSession(): Promise<string> {
  const sessionRes = await fetch("https://www.nseindia.com", {
    headers: NSE_HEADERS,
    next: { revalidate: 0 },
  });
  const raw = sessionRes.headers.get("set-cookie") ?? "";
  return raw
    .split(",")
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

/** Fetch a JSON endpoint from NSE India with session cookies */
export async function fetchNseApi<T = unknown>(
  path: string,
  delayMs = 350,
): Promise<T> {
  const cookieStr = await getNseSession();
  await new Promise((r) => setTimeout(r, delayMs));
  const res = await fetch(`https://www.nseindia.com/api/${path}`, {
    headers: { ...NSE_HEADERS, Cookie: cookieStr },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`NSE API ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

/** Today and N days ago as "DD-MM-YYYY" strings */
export function nseDate(daysAgo = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}
