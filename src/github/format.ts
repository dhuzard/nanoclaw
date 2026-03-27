import type { CategorizedIssues } from './issues.js';
import type { CategorizedPRs } from './pulls.js';

function age(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return '1d';
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}mo`;
}

export function formatIssuesSummary(
  repo: string,
  c: CategorizedIssues,
): string {
  const total = c.blockers.length + c.urgent.length + c.normal.length;
  const lines: string[] = [
    `*${repo}* — ${total} open issue${total !== 1 ? 's' : ''}`,
  ];

  if (c.blockers.length > 0) {
    lines.push(`\n🚨 *Blockers (${c.blockers.length})*`);
    for (const i of c.blockers) {
      lines.push(`  #${i.number} ${i.title} (${age(i.updatedAt)})`);
    }
  }

  if (c.urgent.length > 0) {
    lines.push(`\n⚠️ *Urgent (${c.urgent.length})*`);
    for (const i of c.urgent) {
      lines.push(`  #${i.number} ${i.title} (${age(i.updatedAt)})`);
    }
  }

  if (c.normal.length > 0) {
    lines.push(`\n📋 *Normal (${c.normal.length})*`);
    const shown = c.normal.slice(0, 10);
    for (const i of shown) {
      lines.push(`  #${i.number} ${i.title} (${age(i.updatedAt)})`);
    }
    if (c.normal.length > 10) {
      lines.push(`  … and ${c.normal.length - 10} more`);
    }
  }

  if (total === 0) {
    lines.push('\nNo open issues.');
  }

  return lines.join('\n');
}

export function formatPRsSummary(repo: string, c: CategorizedPRs): string {
  const total =
    c.needsAttention.length +
    c.inReview.length +
    c.drafts.length +
    c.others.length;
  const lines: string[] = [
    `*${repo}* — ${total} open PR${total !== 1 ? 's' : ''}`,
  ];

  if (c.needsAttention.length > 0) {
    lines.push(`\n👀 *Needs attention (${c.needsAttention.length})*`);
    for (const pr of c.needsAttention) {
      const badge =
        pr.reviewDecision === 'APPROVED'
          ? '✅ merge ready'
          : '🔄 changes requested';
      lines.push(
        `  #${pr.number} ${pr.title} [${badge}] (${age(pr.updatedAt)})`,
      );
    }
  }

  if (c.inReview.length > 0) {
    lines.push(`\n🔍 *In review (${c.inReview.length})*`);
    for (const pr of c.inReview) {
      lines.push(
        `  #${pr.number} ${pr.title} by @${pr.author.login} (${age(pr.updatedAt)})`,
      );
    }
  }

  if (c.others.length > 0) {
    lines.push(`\n📭 *Open (${c.others.length})*`);
    const shown = c.others.slice(0, 8);
    for (const pr of shown) {
      lines.push(
        `  #${pr.number} ${pr.title} by @${pr.author.login} (${age(pr.updatedAt)})`,
      );
    }
    if (c.others.length > 8) {
      lines.push(`  … and ${c.others.length - 8} more`);
    }
  }

  if (c.drafts.length > 0) {
    lines.push(`\n📝 *Drafts (${c.drafts.length})*`);
    for (const pr of c.drafts) {
      lines.push(`  #${pr.number} ${pr.title} by @${pr.author.login}`);
    }
  }

  if (total === 0) {
    lines.push('\nNo open PRs.');
  }

  return lines.join('\n');
}

// --- Daily brief types and formatter ---

export interface TopPR {
  repo: string;
  number: number;
  title: string;
  score: number;
  updatedAt: string;
  reviewDecision: string | null;
  isDraft: boolean;
}

export interface RepoBrief {
  repo: string;
  prCounts: { total: number; needsAttention: number; inReview: number };
  issueCounts: { total: number; blockers: number; urgent: number };
}

export function formatBriefSummary(
  topPRs: TopPR[],
  repos: RepoBrief[],
): string {
  const lines: string[] = [
    `📊 *GitHub Daily Brief* — ${repos.length} repo${repos.length !== 1 ? 's' : ''}`,
  ];

  if (topPRs.length > 0) {
    lines.push('\n🔥 *Top PRs needing attention*');
    for (const p of topPRs) {
      const badge =
        p.reviewDecision === 'APPROVED'
          ? '✅'
          : p.reviewDecision === 'CHANGES_REQUESTED'
            ? '🔄'
            : p.isDraft
              ? '📝'
              : '🔍';
      lines.push(
        `  ${p.repo} #${p.number} ${p.title} [${badge}] (${age(p.updatedAt)})`,
      );
    }
  }

  lines.push('\n*Per-repo digest*');
  for (const r of repos) {
    const issueStr =
      r.issueCounts.total === 0
        ? 'no issues'
        : `${r.issueCounts.total} issue${r.issueCounts.total !== 1 ? 's' : ''}` +
          (r.issueCounts.blockers > 0 ? ` 🚨${r.issueCounts.blockers}` : '') +
          (r.issueCounts.urgent > 0 ? ` ⚠️${r.issueCounts.urgent}` : '');
    const prStr =
      r.prCounts.total === 0
        ? 'no PRs'
        : `${r.prCounts.total} PR${r.prCounts.total !== 1 ? 's' : ''}` +
          (r.prCounts.needsAttention > 0
            ? ` 👀${r.prCounts.needsAttention}`
            : '') +
          (r.prCounts.inReview > 0 ? ` 🔍${r.prCounts.inReview}` : '');
    lines.push(`  *${r.repo}*: ${prStr} | ${issueStr}`);
  }

  return lines.join('\n');
}
