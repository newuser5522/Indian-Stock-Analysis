import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, KEY_LENGTH);
  return `${salt.toString("base64url")}:${key.toString("base64url")}`;
}

export function verifyPassword(password: string, encoded: string): boolean {
  const [saltText, keyText, extra] = encoded.split(":");
  if (!saltText || !keyText || extra !== undefined) return false;
  try {
    const salt = Buffer.from(saltText, "base64url");
    const expected = Buffer.from(keyText, "base64url");
    if (salt.length !== 16 || expected.length !== KEY_LENGTH) return false;
    const actual = scryptSync(password, salt, KEY_LENGTH);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function validatePassword(password: unknown): password is string {
  return typeof password === "string" && password.length >= 12 && password.length <= 256;
}
