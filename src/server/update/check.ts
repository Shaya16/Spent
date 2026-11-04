import "server-only";

export interface UpdateInfo {
  /** Commit this build was made from (short sha). */
  current: string;
  /** Newest commit on the tracked branch (short sha). */
  latest: string;
  /** GitHub page listing the changes between the two. */
  url: string;
}

// GitHub owners are letters, digits and hyphens; repo and branch names may also use dots and underscores.
const OWNER = /^[A-Za-z0-9-]+$/;
const NAME = /^[A-Za-z0-9._-]+$/;

/**
 * Compares the running build's commit with the newest commit on a GitHub branch.
 * Only reads public commit metadata; nothing about the user is sent. Returns null when up to date or unknown.
 */
export async function checkForUpdate(opts: {
  repo: string;
  branch: string;
  current: string;
  fetchFn?: typeof fetch;
}): Promise<UpdateInfo | null> {
  const [owner, name, ...rest] = opts.repo.split("/");
  if (rest.length || !owner || !name || !OWNER.test(owner) || !NAME.test(name) || !NAME.test(opts.branch)) return null;
  if (!/^[0-9a-f]{7,40}$/i.test(opts.current)) return null;

  try {
    const res = await (opts.fetchFn ?? fetch)(`https://api.github.com/repos/${owner}/${name}/commits/${opts.branch}`, {
      headers: { Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const sha = ((await res.json()) as { sha?: string }).sha;
    if (!sha || sha.startsWith(opts.current) || opts.current.startsWith(sha)) return null;
    return {
      current: opts.current,
      latest: sha.slice(0, 7),
      url: `https://github.com/${owner}/${name}/compare/${opts.current}...${sha}`,
    };
  } catch {
    return null;
  }
}

/** Sends one message per new version; a later check that finds the same version stays quiet. */
export function createUpdateNotifier(send: (text: string) => Promise<void>) {
  let notified: string | null = null;
  return async (info: UpdateInfo) => {
    if (info.latest === notified) return;
    notified = info.latest;
    await send(
      `A new version of Spent is available (${info.current} -> ${info.latest}).\n` +
        `Changes: ${info.url}\n` +
        `To update, run Spent-update.bat. It backs up your data first and keeps the current version if the new one fails its tests.`
    );
  };
}
