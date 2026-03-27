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
}

export interface CategorizedPRs {
  needsAttention: GhPR[]; // approved (ready to merge) or changes requested
  inReview: GhPR[];       // review required
  drafts: GhPR[];
  others: GhPR[];
}

export function fetchPulls(repo: string): GhPR[] {
  return ghJson<GhPR[]>([
    'pr', 'list',
    '--repo', repo,
    '--state', 'open',
    '--limit', '30',
    '--json', 'number,title,isDraft,author,createdAt,updatedAt,url,reviewDecision,mergeable,labels,headRefName',
  ]);
}

export function categorizePRs(prs: GhPR[]): CategorizedPRs {
  const needsAttention: GhPR[] = [];
  const inReview: GhPR[] = [];
  const drafts: GhPR[] = [];
  const others: GhPR[] = [];

  for (const pr of prs) {
    if (pr.isDraft) {
      drafts.push(pr);
    } else if (pr.reviewDecision === 'CHANGES_REQUESTED' || pr.reviewDecision === 'APPROVED') {
      needsAttention.push(pr);
    } else if (pr.reviewDecision === 'REVIEW_REQUIRED') {
      inReview.push(pr);
    } else {
      others.push(pr);
    }
  }

  return { needsAttention, inReview, drafts, others };
}

// CLI entry point: npx tsx src/github/pulls.ts [owner/repo]
const isMain =
  process.argv[1] != null &&
  (process.argv[1].endsWith('pulls.ts') || process.argv[1].endsWith('pulls.js'));

if (isMain) {
  const repo = process.argv[2] ?? loadConfig().defaultRepo;
  if (!repo) {
    console.error('Error: no repo specified. Pass owner/repo or run /add-github-triage to configure a default.');
    process.exit(1);
  }
  try {
    const prs = fetchPulls(repo);
    const categorized = categorizePRs(prs);
    console.log(formatPRsSummary(repo, categorized));
  } catch (err: unknown) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
