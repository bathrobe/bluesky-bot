// The forever loop: poll, wait, poll again. Any failure (network, 5xx, 429, login) is logged,
// then we wait 30s, 60s, 120s, 240s, 300s, 300s… and try again. One success resets the wait.
// Nothing in here ever throws out of the loop, so the process never exits on an error.

export const FIRST_BACKOFF_SECONDS = 30;
export const MAX_BACKOFF_SECONDS = 5 * 60;

// consecutiveFailures = 1 after the first failure.
export function backoffSecondsAfterFailures(consecutiveFailures: number): number {
  const doubled = FIRST_BACKOFF_SECONDS * 2 ** Math.max(0, consecutiveFailures - 1);
  return Math.min(doubled, MAX_BACKOFF_SECONDS);
}

export function describeError(error: any): string {
  const status = error?.status ? `${error.status} ` : "";
  const name = error?.error ?? error?.name ?? "Error";
  return `${status}${name}: ${String(error?.message ?? error).slice(0, 200)}`;
}

export type PollLoopOptions = {
  pollOnce: () => Promise<void>;
  pollSeconds: number;
  sleep: (seconds: number) => Promise<void>;
  logLine?: (line: string) => void;
  shouldKeepRunning?: () => boolean; // tests stop the loop; main runs forever
};

export async function runPollLoop(options: PollLoopOptions): Promise<void> {
  const { pollOnce, pollSeconds, sleep, logLine = console.log, shouldKeepRunning = () => true } = options;
  let consecutiveFailures = 0;
  while (shouldKeepRunning()) {
    let waitSeconds = pollSeconds;
    try {
      await pollOnce();
      consecutiveFailures = 0;
    } catch (error) {
      consecutiveFailures += 1;
      waitSeconds = backoffSecondsAfterFailures(consecutiveFailures);
      logLine(`poll failed (${consecutiveFailures} in a row): ${describeError(error)}; retrying in ${waitSeconds}s`);
    }
    await sleep(waitSeconds);
  }
}

export function sleepSeconds(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}
