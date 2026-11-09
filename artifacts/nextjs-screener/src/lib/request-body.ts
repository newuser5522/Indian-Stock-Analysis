export class RequestBodyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function readJsonBody(
  request: Request,
  maxBytes = 64 * 1024,
): Promise<unknown> {
  const contentLength = request.headers.get("content-length");
  if (contentLength != null) {
    const length = Number(contentLength);
    if (Number.isFinite(length) && length > maxBytes) {
      throw new RequestBodyError("Request body is too large", 413);
    }
  }

  if (!request.body) throw new RequestBodyError("Request body must be valid JSON", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new RequestBodyError("Request body is too large", 413);
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(body)) as unknown;
  } catch {
    throw new RequestBodyError("Request body must be valid JSON", 400);
  }
}
