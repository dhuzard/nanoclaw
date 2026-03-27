import { fetchIssues, categorizeIssues } from './issues.js';
import { fetchPulls, categorizePRs, scorePR } from './pulls.js';
import { formatBriefSummary, type RepoBrief, type TopPR } from './format.js';
import { loadConfig } from './config.js';

export function generateBrief(repos: string[], username?: string): string {
  const repoBriefs: RepoBrief[] = [];
  const allTopPRs: TopPR[] = [];

  for (const repo of repos) {
    const issues = fetchIssues(repo);
    const catIssues = categorizeIssues(issues);
    const prs = fetchPulls(repo);
    const catPRs = categorizePRs(prs, username);

    const nonDraft = [
      ...catPRs.needsAttention,
      ...catPRs.inReview,
      ...catPRs.others,
    ];
    for (const pr of nonDraft) {
      const score = scorePR(pr, username);
      if (score > 0) {
        allTopPRs.push({
          repo,
          number: pr.number,
          title: pr.title,
          score,
          updatedAt: pr.updatedAt,
          reviewDecision: pr.reviewDecision,
          isDraft: pr.isDraft,
        });
      }
    }

    repoBriefs.push({
      repo,
      prCounts: {
        total: prs.length,
        needsAttention: catPRs.needsAttention.length,
        inReview: catPRs.inReview.length,
      },
      issueCounts: {
        total: issues.length,
        blockers: catIssues.blockers.length,
        urgent: catIssues.urgent.length,
      },
    });
  }

  allTopPRs.sort((a, b) => b.score - a.score);
  const topPRs = allTopPRs.slice(0, 5);

  return formatBriefSummary(topPRs, repoBriefs);
}

// CLI entry point: npm run github:brief [-- repo1 repo2 ...] [--username alice]
const isMain =
  process.argv[1] != null &&
  (process.argv[1].endsWith('brief.ts') ||
    process.argv[1].endsWith('brief.js'));

if (isMain) {
  const argv = process.argv.slice(2);
  let username: string | undefined;
  const repos: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--username') username = argv[++i];
    else if (!argv[i].startsWith('--')) repos.push(argv[i]);
  }

  const config = loadConfig();
  username ??= config.username;

  const resolvedRepos =
    repos.length > 0
      ? repos
      : (config.trackedRepos ??
        (config.defaultRepo ? [config.defaultRepo] : []));

  if (resolvedRepos.length === 0) {
    console.error(
      'Error: no repos configured. Pass repo arguments or set trackedRepos in ~/.config/nanoclaw/github.json.',
    );
    process.exit(1);
  }

  try {
    console.log(generateBrief(resolvedRepos, username));
  } catch (err: unknown) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
