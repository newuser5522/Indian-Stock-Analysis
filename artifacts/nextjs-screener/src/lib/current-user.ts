import { auth } from "@/auth";

export async function getCurrentUserId(): Promise<number | null> {
  const session = await auth();
  const rawId = session?.user?.id;
  if (!rawId || !/^[1-9]\d*$/.test(rawId)) return null;
  const id = Number(rawId);
  return Number.isSafeInteger(id) ? id : null;
}
