import fs from 'fs';
import os from 'os';
import path from 'path';

const CONFIG_PATH = path.join(os.homedir(), '.config', 'nanoclaw', 'github.json');

export interface GithubConfig {
  defaultRepo?: string;
}

export function loadConfig(): GithubConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as GithubConfig;
    }
  } catch {
    // ignore malformed config
  }
  return {};
}

export function saveConfig(config: GithubConfig): void {
  const dir = path.dirname(CONFIG_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
}
