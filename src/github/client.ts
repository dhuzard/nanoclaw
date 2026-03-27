import { execFileSync } from 'child_process';

// Inject GITHUB_TOKEN as GH_TOKEN so gh CLI picks it up automatically.
function getEnv(): NodeJS.ProcessEnv {
  const token = process.env.GITHUB_TOKEN;
  return token ? { ...process.env, GH_TOKEN: token } : process.env;
}

export function ghJson<T>(args: string[]): T {
  try {
    const out = execFileSync('gh', args, {
      env: getEnv(),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return JSON.parse(out) as T;
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      (err as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      throw new Error('gh CLI not found. Install from https://cli.github.com');
    }
    const stderr =
      err instanceof Error && 'stderr' in err
        ? String((err as NodeJS.ErrnoException & { stderr: unknown }).stderr)
        : '';
    const base = err instanceof Error ? err.message : String(err);
    throw new Error(`gh CLI failed: ${stderr || base}`);
  }
}

export function checkGhInstalled(): void {
  try {
    execFileSync('gh', ['--version'], { encoding: 'utf-8', stdio: 'pipe' });
  } catch {
    throw new Error('gh CLI not found. Install from https://cli.github.com');
  }
}

export function checkGhAuth(): void {
  try {
    execFileSync('gh', ['auth', 'status'], {
      env: getEnv(),
      encoding: 'utf-8',
      stdio: 'pipe',
    });
  } catch (err: unknown) {
    const hint = process.env.GITHUB_TOKEN
      ? 'GITHUB_TOKEN is set but gh rejected it — verify the token has repo scope.'
      : 'Not authenticated. Set GITHUB_TOKEN in .env or run: gh auth login';
    throw new Error(
      `gh auth check failed: ${hint}\n${err instanceof Error ? err.message : ''}`,
    );
  }
}
