// Check the meme catalog. Read-only: resolves public posts, sends nothing.
//   pnpm tsx --env-file=.env scripts/checkCatalog.ts [--posted-only] [--catalog <path>]
// Exits 1 if any checked entry has no file in config.memeFolder, no post, or a post that doesn't resolve.
import { config } from "../src/config.ts";
import { createSession } from "../src/bluesky/session.ts";
import { loadCatalog } from "../src/memes/catalog.ts";
import { checkCatalog } from "../src/memes/checkCatalog.ts";
import { createBlueskyPostResolver } from "../src/memes/resolvePosts.ts";

function parseArguments(commandLineArguments: string[]) {
  let postedOnly = false;
  let catalogPath = config.memeCatalogPath;
  for (let index = 0; index < commandLineArguments.length; index++) {
    const argument = commandLineArguments[index];
    if (argument === "--posted-only") postedOnly = true;
    else if (argument === "--catalog") {
      catalogPath = commandLineArguments[++index];
      if (!catalogPath) throw new Error("--catalog needs a path");
    } else throw new Error(`unknown argument "${argument}". usage: checkCatalog.ts [--posted-only] [--catalog <path>]`);
  }
  return { postedOnly, catalogPath };
}

async function main() {
  const { postedOnly, catalogPath } = parseArguments(process.argv.slice(2));
  const entries = await loadCatalog(catalogPath);
  const session = await createSession();
  const result = await checkCatalog({
    entries,
    memeFolder: config.memeFolder,
    resolvePostLinks: createBlueskyPostResolver(session),
    postedOnly,
  });

  for (const entryCheck of result.entryChecks) {
    if (entryCheck.problems.length === 0) console.log(`ok    ${entryCheck.file}`);
    else console.log(`FAIL  ${entryCheck.file}: ${entryCheck.problems.join("; ")}`);
  }
  const checkedCount = result.entryChecks.length;
  console.log(
    `\n${checkedCount - result.problemEntryCount} ok, ${result.problemEntryCount} with problems ` +
      `(${checkedCount} checked of ${entries.length} in ${catalogPath}${postedOnly ? ", --posted-only" : ""})`,
  );
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`checkCatalog: ${error?.message ?? error}`);
  process.exit(1);
});
