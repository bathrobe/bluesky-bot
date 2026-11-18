// Print the newest run log. `pnpm last` reads logs/; `pnpm last <dir>` reads another folder.
// No network, no secrets.
import { findNewestRunLogPath, defaultLogsDirectory } from "../src/log.ts";
import { readFile } from "node:fs/promises";

const logsDirectory = process.argv[2] ?? defaultLogsDirectory;
const newestPath = await findNewestRunLogPath(logsDirectory);

if (!newestPath) {
  console.log(`No run logs in ${logsDirectory}`);
} else {
  console.log(`# ${newestPath}`);
  console.log(await readFile(newestPath, "utf8"));
}
