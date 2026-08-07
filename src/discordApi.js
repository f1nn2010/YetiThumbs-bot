const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function discordApiRequest({
  token,
  path,
  fetchImpl = fetch,
  sleep = wait,
  maxAttempts = 4,
}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetchImpl(`https://discord.com/api/v10${path}`, {
      headers: { authorization: `Bot ${token}` },
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return data;

    const transient = response.status === 429 || response.status >= 500;
    if (!transient || attempt === maxAttempts) {
      throw new Error(
        `Discord ${path} failed (${response.status}): ${data.message ?? "unknown error"}`,
      );
    }

    const retryAfterHeader = response.headers.get("retry-after");
    const retryAfterSeconds = Number(retryAfterHeader);
    const retryDelay =
      retryAfterHeader != null &&
      Number.isFinite(retryAfterSeconds) &&
      retryAfterSeconds > 0
      ? Math.min(5_000, Math.max(250, retryAfterSeconds * 1_000))
      : Math.min(5_000, 500 * 2 ** (attempt - 1));
    console.warn(
      `Discord ${path} returned ${response.status}; retrying in ${retryDelay}ms (${attempt}/${maxAttempts}).`,
    );
    await sleep(retryDelay);
  }

  throw new Error(`Discord ${path} failed after ${maxAttempts} attempts`);
}
