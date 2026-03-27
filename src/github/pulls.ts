import { ghJson } from './client.js';
import { formatPRsSummary } from './format.js';
import { loadConfig } from './config.js';

export interface GhPR {
  number: number;
  title: string;
  isDraft: boolean;
  author: { login: string };
  createdAt: string;
  updatedAt: string;
  url: string;
  reviewDecision: string | null;
  mergeable: string | null;
  labels: Array<{ name: string }>;
  headRefName: string;
  reviewRequests: Array<{ login: string }>;
  statusCheckRollup: Array<{ conclusion?: string; state?: string }>;
}

export interface CategorizedPRs {
  needsAttention: GhPR[]; // approved (ready to merge) or changes requested
  inReview: GhPR[]; // review required
  drafts: GhPR[];
  others: GhPR[];
}

export interface PRFilters {
  label?: string;
  assignee?: string;
  days?: number;
}

export function scorePR(pr: GhPR, username?: string): number {
  let score = 0;
  if (username && pr.reviewRequests.some((r) => r.login === username))
    score += 100;
  const hasFailing = pr.statusCheckRollup.some(
    (c) =>
      c.conclusion === 'FAILURE' ||
      c.conclusion === 'TIMED_OUT' ||
      c.state === 'FAILURE',
  );
  if (hasFailing) score += 60;
  if (pr.mergeable === 'CONFLICTING') score += 40;
  if (pr.reviewDecision === 'CHANGES_REQUESTED') score += 30;
  if (pr.reviewDecision === 'REVIEW_REQUIRED') score += 20;
  const staleDays =
    (Date.now() - new Date(pr.updatedAt).getTime()) / 86_400_000;
  if (staleDays > 14) score += 10;
  if (pr.isDraft) score -= 50;
  return score;
}

export function fetchPulls(repo: string, filters: PRFilters = {}): GhPR[] {
  const args = [
    'pr',
    'list',
    '--repo',
    repo,
    '--state',
    'open',
    '--limit',
    '30',
    '--json',
    'number,title,isDraft,author,createdAt,updatedAt,url,reviewDecision,mergeable,labels,headRefName,reviewRequests,statusCheckRollup',
  ];
  if (filters.label) args.push('--label', filters.label);
  if (filters.assignee) args.push('--assignee', filters.assignee);
  let prs = ghJson<GhPR[]>(args);
  if (filters.days !== undefined) {
    const cutoff = Date.now() - filters.days * 86_400_000;
    prs = prs.filter((pr) => new Date(pr.updatedAt).getTime() >= cutoff);
  }
  return prs;
}

export function categorizePRs(prs: GhPR[], username?: string): CategorizedPRs {
  const needsAttention: GhPR[] = [];
  const inReview: GhPR[] = [];
  const drafts: GhPR[] = [];
  const others: GhPR[] = [];

  for (const pr of prs) {
    if (pr.isDraft) {
      drafts.push(pr);
    } else if (
      pr.reviewDecision === 'CHANGES_REQUESTED' ||
      pr.reviewDecision === 'APPROVED'
    ) {
      needsAttention.push(pr);
    } else if (pr.reviewDecision === 'REVIEW_REQUIRED') {
      inReview.push(pr);
    } else {
      others.push(pr);
    }
  }

  const byScore = (a: GhPR, b: GhPR): number =>
    scorePR(b, username) - scorePR(a, username);
  needsAttention.sort(byScore);
  inReview.sort(byScore);

  return { needsAttention, inReview, drafts, others };
}

// CLI entry point: npm run github:pulls [-- owner/repo] [--username alice] [--label foo] [--days 7]
const isMain =
  process.argv[1] != null &&
  (process.argv[1].endsWith('pulls.ts') ||
    process.argv[1].endsWith('pulls.js'));

if (isMain) {
  const argv = process.argv.slice(2);
  let repo: string | undefined;
  let username: string | undefined;
  const filters: PRFilters = {};

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--username') username = argv[++i];
    else if (argv[i] === '--label') filters.label = argv[++i];
    else if (argv[i] === '--assignee') filters.assignee = argv[++i];
    else if (argv[i] === '--days') filters.days = parseInt(argv[++i], 10);
    else if (!argv[i].startsWith('--')) repo = argv[i];
  }

  const config = loadConfig();
  repo ??= config.defaultRepo;
  username ??= config.username;

  if (!repo) {
    console.error(
      'Error: no repo specified. Pass owner/repo or run /add-github-triage to configure a default.',
    );
    process.exit(1);
  }
  try {
    const prs = fetchPulls(repo, filters);
    const categorized = categorizePRs(prs, username);
    console.log(formatPRsSummary(repo, categorized));
  } catch (err: unknown) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
