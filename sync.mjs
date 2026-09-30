#!/usr/bin/env node
/**
 * sync — copy the freshly built OPML packs in from the site, and regenerate
 * every count in the README from the files themselves.
 *
 *   node sync.mjs [path-to-FeedsBarWebsite]
 *
 * WHY THIS EXISTS RATHER THAN "remember to copy the files". On 2026-09-29 this
 * mirror held 498 feeds, the live pack held 493, the README table said 498 and
 * the repo description said 495. Three numbers for one dataset, drifting since
 * 2026-09-24, unnoticed. This repo is the copy our outreach tells people to
 * fork, so it is the one a stranger is most likely to actually use.
 *
 * Copying the packs by hand fixes today and resets the clock. The counts are
 * the part that rots, because a human updates the files and forgets the prose.
 * So the prose is DERIVED: every number in the README below comes from counting
 * xmlUrl entries in the packs that were just copied. Same move as deriving a
 * stat tile from the rows it describes rather than typing it above them.
 *
 * The site build warns when this repo has drifted (scripts/check-opml-mirror.mjs
 * over there). This is the other half: the thing you run when it does.
 *
 * WHAT IT DOES NOT TOUCH: the GitHub repo description, which lives in GitHub's
 * own metadata and not in any file here. It prints the line to paste. And the
 * Zenodo record, which is immutable per version by design and is a separate
 * decision about when to cut a new one.
 */

import { readFileSync, writeFileSync, readdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(
  process.argv[2] ??
    join(homedir(), 'ClaudeHQ', 'dev', 'mml', 'feedsbar', 'FeedsBarWebsite'),
);
const src = join(site, 'public', 'opml');

if (!existsSync(src)) {
  console.error(`no packs at ${src}`);
  console.error('Build them first: cd <site> && node scripts/fetch-signal500.mjs && node scripts/build-opml.mjs');
  process.exit(1);
}

const count = (f) => (readFileSync(f, 'utf8').match(/xmlUrl="/g) ?? []).length;
/**
 * "business-money.opml" -> the pillar name the pack declares, so the table can
 * never disagree with the data.
 *
 * Packs title themselves "The Signal 500 — Business &amp; Money — feeds.bar",
 * so the pillar is the MIDDLE segment. A first version stripped only the
 * leading brand and produced "— Business &amp; Money — feeds.bar" in the table,
 * entities and all. Split on the em dash, take the middle, decode.
 */
const decode = (t) =>
  t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
   .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const packTitle = (f) => {
  const m = readFileSync(f, 'utf8').match(/<title>([^<]+)<\/title>/);
  if (!m) return null;
  const parts = decode(m[1]).split('\u2014').map((x) => x.trim()).filter(Boolean);
  // ["The Signal 500", "Business & Money", "feeds.bar"] -> the middle one.
  return parts.length >= 3 ? parts.slice(1, -1).join(' ') : null;
};

const files = readdirSync(src).filter((f) => f.endsWith('.opml'));
if (!files.length) { console.error(`no .opml files in ${src}`); process.exit(1); }

let total = 0;
const rows = [];
for (const f of files) {
  copyFileSync(join(src, f), join(here, 'opml', f));
  const n = count(join(here, 'opml', f));
  if (f === 'signal-500.opml') { total = n; continue; }
  rows.push({ name: packTitle(join(here, 'opml', f)) ?? f.replace('.opml', ''), n, f });
}
rows.sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));

const table = [
  '| Pack | Sources | File |',
  '|---|---|---|',
  `| Everything | ${total} | [\`signal-500.opml\`](opml/signal-500.opml) |`,
  ...rows.map((r) => `| ${r.name} | ${r.n} | [\`${r.f}\`](opml/${r.f}) |`),
].join('\n');

let readme = readFileSync(join(here, 'README.md'), 'utf8');

// The lead sentence's count, and the table, both derived. The brand name
// "Signal 500" is left alone: it is a name, not a count, and replacing it is
// how you end up with "The Signal 493".
readme = readme.replace(
  /^\d+ news and expert sources,/m,
  `${total} news and expert sources,`,
);
readme = readme.replace(/\| Pack \| Sources \| File \|[\s\S]*?(?=\n\n)/, table);

// THE SNAPSHOT DATE, regenerated too. It was not, and drifted: on 2026-09-30
// the README said "Snapshot: 2026-09-24" three lines above "Packs synced
// 2026-09-29", two dates for one dataset in one file. The vintage of the DATA
// is the snapshot's `generated_at`, not the day somebody ran this script, so it
// is read from the site's own committed snapshot rather than from the clock.
try {
  const snap = JSON.parse(
    readFileSync(join(site, 'src', 'data', 'signal500.json'), 'utf8'),
  );
  const vintage = String(snap.generated_at ?? '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(vintage)) {
    readme = readme.replace(
      /^Snapshot: \*\*[^*]+\*\*/m,
      `Snapshot: **${vintage}**`,
    );
  }
} catch {
  // No snapshot file: leave the line alone rather than stamping a guess.
}

// A count without a date is a claim that silently expires.
const today = new Date().toISOString().slice(0, 10);
if (/^_Packs synced /m.test(readme)) {
  readme = readme.replace(/^_Packs synced [^_]*_$/m, `_Packs synced ${today} from feeds.bar._`);
} else {
  readme = readme.replace(table, `${table}\n\n_Packs synced ${today} from feeds.bar._`);
}

writeFileSync(join(here, 'README.md'), readme);

console.log(`✓ synced ${files.length} packs, ${total} feeds total`);
console.log('  README lead sentence, table and sync date regenerated from the files.');
console.log('');
console.log('  Still manual, because it is not in any file here. Paste as the repo description:');
console.log(`    ${total} hand-scored news and expert sources as OPML packs. Method published, CC BY 4.0, doi:10.5281/zenodo.22311917`);
console.log('');
console.log('  Then: git add -A && git commit && git push');
