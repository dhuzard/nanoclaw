import { ghJson } from './client.js';
import { formatIssuesSummary } from './format.js';
import { loadConfig } from './config.js';

export interface GhIssue {
  number: number;
  title: string;
  labels: Array<{ name: string }>;
  createdAt: string;
  updatedAt: string;
  url: string;
  milestone: { title: string } | null;
  assignees: Array<{ login: string }>;
}

export interface CategorizedIssues {
  blockers: GhIssue[];
  urgent: GhIssue[];
  normal: GhIssue[];
}

const BLOCKER_LABELS = ['blocker', 'critical', 'p0', 'severity:critical', 'priority:critical'];
const URGENT_LABELS = ['urgent', 'high-priority', 'p1', 'bug', 'severity:high', 'priority:high'];

export function fetchIssues(repo: string): GhIssue[] {
  return ghJson<GhIssue[]>([
    'issue', 'list',
    '--repo', repo,
    '--state', 'open',
    '--limit', '50',
    '--json', 'number,title,labels,createdAt,updatedAt,url,milestone,assignees',
  ]);
}

export function categorizeIssues(issues: GhIssue[]): CategorizedIssues {
  const blockers: GhIssue[] = [];
  const urgent: GhIssue[] = [];
  const normal: GhIssue[] = [];

  for (const issue of issues) {
    const names = issue.labels.map((l) => l.name.toLowerCase());
    if (BLOCKER_LABELS.some((b) => names.includes(b))) {
      blockers.push(issue);
    } else if (URGENT_LABELS.some((u) => names.includes(u))) {
      urgent.push(issue);
    } else {
      normal.push(issue);
    }
  }

  return { blockers, urgent, normal };
}

// CLI entry point: npx tsx src/github/issues.ts [owner/repo]
const isMain =
  process.argv[1] != null &&
  (process.argv[1].endsWith('issues.ts') || process.argv[1].endsWith('issues.js'));

if (isMain) {
  const repo = process.argv[2] ?? loadConfig().defaultRepo;
  if (!repo) {
    console.error('Error: no repo specified. Pass owner/repo or run /add-github-triage to configure a default.');
    process.exit(1);
  }
  try {
    const issues = fetchIssues(repo);
    const categorized = categorizeIssues(issues);
    console.log(formatIssuesSummary(repo, categorized));
  } catch (err: unknown) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
