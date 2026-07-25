export async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return (body as { error?: string }).error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}
