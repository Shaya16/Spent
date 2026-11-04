import "server-only";

import path from "path";

/** Where the database and the encryption key live: SPENT_DATA_DIR, or ./data. */
export function dataDir(): string {
  return process.env.SPENT_DATA_DIR
    ? path.resolve(process.env.SPENT_DATA_DIR)
    : path.join(process.cwd(), "data");
}
