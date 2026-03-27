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

export interface IssueFilters {
  label?: string;
  assignee?: string;
  days?: number;
}

const BLOCKER_LABELS = [
  'blocker',
  'critical',
  'p0',
  'severity:critical',
  'priority:critical',
];
const URGENT_LABELS = [
  'urgent',
  'high-priority',
  'p1',
  'bug',
  'severity:high',
  'priority:high',
];

export function fetchIssues(
  repo: string,
  filters: IssueFilters = {},
): GhIssue[] {
  const args = [
    'issue',
    'list',
    '--repo',
    repo,
    '--state',
    'open',
    '--limit',
    '50',
    '--json',
    'number,title,labels,createdAt,updatedAt,url,milestone,assignees',
  ];
  if (filters.label) args.push('--label', filters.label);
  if (filters.assignee) args.push('--assignee', filters.assignee);
  let issues = ghJson<GhIssue[]>(args);
  if (filters.days !== undefined) {
    const cutoff = Date.now() - filters.days * 86_400_000;
    issues = issues.filter((i) => new Date(i.updatedAt).getTime() >= cutoff);
  }
  return issues;
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

// CLI entry point: npm run github:issues [-- owner/repo] [--label foo] [--assignee alice] [--days 7]
const isMain =
  process.argv[1] != null &&
  (process.argv[1].endsWith('issues.ts') ||
    process.argv[1].endsWith('issues.js'));

if (isMain) {
  const argv = process.argv.slice(2);
  let repo: string | undefined;
  const filters: IssueFilters = {};

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--label') filters.label = argv[++i];
    else if (argv[i] === '--assignee') filters.assignee = argv[++i];
    else if (argv[i] === '--days') filters.days = parseInt(argv[++i], 10);
    else if (!argv[i].startsWith('--')) repo = argv[i];
  }

  repo ??= loadConfig().defaultRepo;

  if (!repo) {
    console.error(
      'Error: no repo specified. Pass owner/repo or run /add-github-triage to configure a default.',
    );
    process.exit(1);
  }
  try {
    const issues = fetchIssues(repo, filters);
    const categorized = categorizeIssues(issues);
    console.log(formatIssuesSummary(repo, categorized));
  } catch (err: unknown) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
