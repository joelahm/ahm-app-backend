// Editorial-quality HTML report. Rendered to PDF via lib/pdf.js for
// client-facing delivery. Inline CSS only (offline-renderable).
//
// Sections in order:
//   1. Cover — magazine-style with hero screenshot
//   2. Executive Summary — AI-written narrative + score gauge + Lighthouse
//   3. Strengths — what's working
//   4. Quick Wins — AI-curated <1hr fixes
//   5. Issues & Fixes — track-split (marketing vs dev), enriched cards
//   6. Effort/Impact Matrix — top issues plotted on 2x2
//   7. 30/60/90 Roadmap — AI-generated action plan
//   8. Per-Page Analysis — screenshots + score chips + checklists
//   9. URL Structure — table with slug grades + duplicate-title detection
//  10. Navigation & Patient Journey — nav tree + conversion path + trust signals

const { siteScore } = require('./score');
const { checkSiteStrengths } = require('./strengths');
const { enrichFlag } = require('./issueLibrary');

// ─── tiny helpers ─────────────────────────────────────────────────────

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const sevColor = (s) => s === 'high' ? '#EF4444' : s === 'medium' ? '#F59E0B' : '#10B981';
const sevLabel = (s) => s === 'high' ? 'HIGH IMPACT' : s === 'medium' ? 'MEDIUM IMPACT' : 'LOW IMPACT';
const trackPill = (t) => t === 'dev'
  ? '<span class="pill pill-dev">🛠️ Dev team</span>'
  : '<span class="pill pill-mkt">✍️ Marketing</span>';

function pageLabel(client, page) {
  if (page.url === client.url) return 'Homepage';
  try { return new URL(page.url).pathname || page.url; } catch { return page.url; }
}

function legacySeverity(flag) {
  const f = String(flag).toLowerCase();
  if (/^http \d|missing <title>|no <h1>|missing <meta name="viewport"|no <form>|no conversion path|no booking\/appointment cta|no styled cta buttons|critically low|seo low|accessibility low/.test(f)) return 'high';
  if (/multiple <h1>|title too short|title too long|meta description too|missing meta description|no "privacy policy"|no "terms"|no "cookie policy"|footer does not contain|no gtm container|missing <link rel="canonical|no json-ld|missing <html lang|no clickable phone|no social proof|no medical or local-business schema|many competing ctas|no gmc number|stock host|stock filename|long contact form|poor url slug|performance low|accessibility below|seo below|best practices low/.test(f)) return 'medium';
  return 'low';
}

function buildLighthouseFlags(audit) {
  const out = [];
  for (const strategy of ['mobile', 'desktop']) {
    const s = audit?.lighthouse?.[strategy]?.scores;
    if (!s) continue;
    const label = strategy === 'mobile' ? 'Mobile' : 'Desktop';
    if (s.performance != null && s.performance < 50) out.push(`${label} Performance critically low: ${s.performance}/100`);
    else if (s.performance != null && s.performance < 70) out.push(`${label} Performance low: ${s.performance}/100`);
    if (s.accessibility != null && s.accessibility < 70) out.push(`${label} Accessibility low: ${s.accessibility}/100`);
    else if (s.accessibility != null && s.accessibility < 90) out.push(`${label} Accessibility below target: ${s.accessibility}/100`);
    if (s.seo != null && s.seo < 70) out.push(`${label} SEO low: ${s.seo}/100`);
    else if (s.seo != null && s.seo < 90) out.push(`${label} SEO below target: ${s.seo}/100`);
    if (s.bestPractices != null && s.bestPractices < 80) out.push(`${label} Best Practices low: ${s.bestPractices}/100`);
  }
  return out;
}

function gatherIssues(client, audit) {
  const issues = [];
  for (const lhFlag of buildLighthouseFlags(audit)) {
    const e = enrichFlag(lhFlag, legacySeverity(lhFlag));
    issues.push({ where: 'Site (Lighthouse)', ...e });
  }
  for (const page of audit.pages || []) {
    const where = pageLabel(client, page);
    for (const flag of (page.seo?.flags || [])) {
      const e = enrichFlag(flag, legacySeverity(flag));
      issues.push({ where, ...e });
    }
    for (const img of (page.images?.flagged || [])) {
      for (const f of (img.flags || [])) {
        const e = enrichFlag(f, legacySeverity(f));
        issues.push({ where, ...e });
      }
    }
    for (const v of (page.vision?.issues || [])) {
      const sev = (v.severity || '').toLowerCase();
      const fallback = sev === 'critical' ? 'high' : (sev === 'high' || sev === 'medium' || sev === 'low') ? sev : 'medium';
      issues.push({
        where,
        severity: fallback,
        track: v.category === 'broken' ? 'dev' : 'marketing',
        rootCause: `Visual review (${v.viewport || 'both'} viewport): ${v.issue}`,
        howToFix: v.fix || 'Investigate the highlighted element and apply layout / spacing fixes.',
        businessImpact: 'Layout problems erode trust and increase bounce. Mobile-break issues especially.',
        flag: v.issue,
      });
    }
  }
  return issues;
}

function groupIssues(issues) {
  const keyOf = (i) => {
    let s = String(i.flag || '').toLowerCase();
    s = s.replace(/\(\d+ chars/g, '(N chars').replace(/: \d+\/100/g, ': N/100').replace(/\(\d+ buttons/g, '(N buttons');
    s = s.replace(/"[^"]*"/g, '"…"');
    s = s.replace(/^stock filename:\s*\S+/i, 'stock filename: <name>');
    s = s.replace(/^missing alt:\s*\S+/i, 'missing alt: <file>');
    s = s.replace(/^stock host:\s*\S+/i, 'stock host: <host>');
    return `${i.severity || 'low'}|${i.track}|${s.slice(0, 120)}`;
  };
  const groups = new Map();
  for (const issue of issues) {
    const k = keyOf(issue);
    if (!groups.has(k)) groups.set(k, { ...issue, wheres: new Set([issue.where]), examples: [issue.flag] });
    else { const g = groups.get(k); g.wheres.add(issue.where); if (g.examples.length < 3) g.examples.push(issue.flag); }
  }
  return [...groups.values()].map((g) => ({ ...g, wheres: [...g.wheres], occurrences: g.wheres.size }));
}

function pickTopFixes(issues, n = 3) {
  const grouped = groupIssues(issues);
  return grouped.sort((a, b) => {
    const r = { high: 0, medium: 1, low: 2 };
    if (r[a.severity] !== r[b.severity]) return r[a.severity] - r[b.severity];
    if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
    return a.track === 'marketing' ? -1 : 1;
  }).slice(0, n);
}

// ─── score gauge (SVG arc) ─────────────────────────────────────────────

function scoreGauge(score, grade, size = 200) {
  const r = size * 0.4;
  const cx = size / 2; const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const dashArray = `${pct * circ} ${circ}`;
  const color = score >= 80 ? '#10B981' : score >= 65 ? '#F59E0B' : score >= 50 ? '#FB923C' : '#EF4444';
  const numSize = size * 0.22;
  const labelSize = size * 0.065;
  return `
  <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${cx}" cy="${cy}" r="${r}" stroke="#E5E7EB" stroke-width="${size * 0.07}" fill="none"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" stroke="${color}" stroke-width="${size * 0.07}" fill="none"
      stroke-dasharray="${dashArray}" stroke-linecap="round"
      transform="rotate(-90 ${cx} ${cy})"/>
    <text x="${cx}" y="${cy - size * 0.025}" text-anchor="middle" font-size="${numSize}" font-weight="800" fill="#0F172A">${score}</text>
    <text x="${cx}" y="${cy + size * 0.125}" text-anchor="middle" font-size="${labelSize}" font-weight="700" fill="#64748B" letter-spacing="2">GRADE ${grade}</text>
  </svg>`;
}

function miniBar(score) {
  if (score == null) return '<div class="bar-track"><div class="bar-fill" style="width:0%;background:#CBD5E1"></div></div><span class="bar-text">—</span>';
  const color = score >= 90 ? '#10B981' : score >= 70 ? '#F59E0B' : score >= 50 ? '#FB923C' : '#EF4444';
  return `<div class="bar-track"><div class="bar-fill" style="width:${score}%;background:${color}"></div></div><span class="bar-text">${score}</span>`;
}

// ─── styles ────────────────────────────────────────────────────────────

const STYLES = `
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    font-family: 'Inter', system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: #0F172A; background: #FFFFFF;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
    font-size: 11pt; line-height: 1.55;
    font-feature-settings: "ss01", "cv02", "cv11";
  }
  h1, h2, h3, h4 { margin: 0; font-weight: 700; letter-spacing: -0.015em; }
  h2 { font-size: 26pt; margin: 0 0 12pt; color: #0F172A; line-height: 1.1; font-weight: 800; }
  h3 { font-size: 14pt; margin: 14pt 0 8pt; color: #0F172A; }
  h4 { font-size: 12pt; margin: 10pt 0 6pt; color: #1E293B; }
  p { margin: 0 0 8pt; }
  a { color: #2563EB; text-decoration: none; }
  table { width: 100%; border-collapse: collapse; }

  /* Page wrapper */
  .page {
    page-break-after: always; break-after: page;
    padding: 26mm 22mm 24mm;
    min-height: 297mm; height: 297mm;
    position: relative; overflow: hidden;
  }
  .page:last-child { page-break-after: auto; }

  .brand-strip {
    position: absolute; top: 0; left: 0; right: 0; height: 5mm;
    background: linear-gradient(90deg, #0F172A 0%, #1E40AF 50%, #0EA5E9 100%);
  }
  .footer {
    position: absolute;
    bottom: 10mm; left: 22mm; right: 22mm;
    font-size: 8pt; color: #94A3B8;
    display: flex; justify-content: space-between;
    border-top: 1px solid #E2E8F0; padding-top: 5pt;
    letter-spacing: 0.5px;
  }

  /* ─── COVER ─── */
  .cover {
    page-break-after: always; break-after: page;
    padding: 0; margin: 0; height: 297mm; width: 210mm;
    position: relative; overflow: hidden;
    display: grid;
    grid-template-columns: 100mm 110mm;
    grid-template-rows: 1fr;
    background: #0F172A;
  }
  .cover-left {
    background: linear-gradient(155deg, #0F172A 0%, #1E3A8A 70%, #1E40AF 100%);
    color: #FFFFFF;
    padding: 28mm 14mm 28mm 22mm;
    display: flex; flex-direction: column; justify-content: space-between;
    position: relative; overflow: hidden;
  }
  .cover-left::before {
    content: ''; position: absolute; top: -60mm; left: -30mm;
    width: 130mm; height: 130mm;
    background: radial-gradient(circle, rgba(14,165,233,0.18) 0%, transparent 70%);
    border-radius: 50%;
  }
  .cover-right {
    background: linear-gradient(155deg, #1E40AF 0%, #0EA5E9 100%);
    position: relative; overflow: hidden;
  }
  .cover-screenshot {
    position: absolute;
    top: 30mm; left: 6mm; right: -20mm; bottom: 50mm;
    background: #FFF;
    border-radius: 4mm;
    overflow: hidden;
    box-shadow: 0 30px 60px rgba(0,0,0,0.45), 0 12px 24px rgba(0,0,0,0.3);
    border: 4px solid rgba(255,255,255,0.18);
  }
  .cover-screenshot img {
    width: 100%; height: 100%; object-fit: cover; object-position: top center; display: block;
  }
  .cover-screenshot-empty {
    width: 100%; height: 100%; background: rgba(255,255,255,0.05);
    display: flex; align-items: center; justify-content: center;
    color: rgba(255,255,255,0.4); font-size: 10pt;
  }
  .cover-brand {
    font-size: 9pt; letter-spacing: 4px; text-transform: uppercase;
    color: rgba(255,255,255,0.65); font-weight: 700; position: relative; z-index: 1;
  }
  .cover-eyebrow {
    font-size: 9pt; color: rgba(255,255,255,0.7); margin-top: 2mm;
    letter-spacing: 1px; font-weight: 500;
  }
  .cover-title {
    font-size: 36pt; font-weight: 900; line-height: 1.02;
    color: #FFFFFF; margin-top: 14mm;
    letter-spacing: -0.02em;
    position: relative; z-index: 1;
  }
  .cover-headline {
    font-size: 14pt; color: rgba(255,255,255,0.92);
    margin-top: 8mm; line-height: 1.45; font-weight: 400;
    border-left: 2px solid rgba(255,255,255,0.4); padding-left: 4mm;
    position: relative; z-index: 1;
  }
  .cover-meta {
    margin-top: auto; position: relative; z-index: 1;
    border-top: 1px solid rgba(255,255,255,0.18); padding-top: 6mm;
    display: grid; grid-template-columns: 1fr 1fr; gap: 4mm;
  }
  .cover-meta-block {}
  .cover-meta-label {
    color: rgba(255,255,255,0.5); text-transform: uppercase;
    letter-spacing: 1.5px; font-size: 7.5pt; font-weight: 600;
  }
  .cover-meta-value {
    color: #FFFFFF; font-size: 11pt; font-weight: 600; margin-top: 1.5mm;
    word-break: break-word;
  }
  .cover-score-card {
    position: absolute;
    top: 28mm; right: 14mm;
    background: #FFFFFF;
    border-radius: 5mm;
    padding: 8mm 10mm;
    box-shadow: 0 30px 60px rgba(0,0,0,0.35), 0 12px 24px rgba(0,0,0,0.25);
    z-index: 5;
    text-align: center;
  }
  .cover-score-label {
    font-size: 7.5pt; color: #64748B; text-transform: uppercase;
    letter-spacing: 2px; font-weight: 700;
  }
  .cover-score-num {
    font-size: 56pt; font-weight: 900; line-height: 1;
    color: #0F172A; margin-top: 1mm;
    font-feature-settings: "tnum";
  }
  .cover-score-status {
    font-size: 10pt; color: #475569; font-weight: 600; margin-top: 1mm;
  }
  .cover-score-grade {
    display: inline-block;
    margin-top: 3mm; padding: 2mm 6mm;
    border-radius: 999px; font-size: 9pt; font-weight: 800;
    letter-spacing: 0.5px;
  }

  /* ─── REUSABLE COMPONENTS ─── */
  .section-eyebrow {
    display: inline-block;
    font-size: 8pt; color: #2563EB; font-weight: 800;
    text-transform: uppercase; letter-spacing: 2.5px;
    margin-bottom: 4mm;
  }
  .divider {
    height: 2px; background: linear-gradient(90deg, #2563EB 0%, transparent 80%);
    border: 0; margin: 0 0 6mm;
  }
  .lede {
    font-size: 11.5pt; color: #475569; line-height: 1.65;
    margin-bottom: 6mm; max-width: 160mm;
  }

  /* Lighthouse scoreboard */
  .lh-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; margin: 5mm 0; }
  .lh-card {
    background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8pt;
    padding: 3.5mm 4mm;
  }
  .lh-card-label { font-size: 7.5pt; color: #64748B; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
  .lh-card-row { display: flex; align-items: center; gap: 3mm; margin-top: 2.5mm; }
  .lh-card-row span.bar-text { width: 8mm; text-align: right; font-weight: 700; font-size: 10pt; color: #0F172A; }
  .lh-card-strategy { font-size: 7.5pt; color: #94A3B8; width: 11mm; font-weight: 600; }
  .bar-track { flex: 1; height: 4pt; background: #E2E8F0; border-radius: 999px; overflow: hidden; }
  .bar-fill { height: 100%; }

  /* Pills */
  .pill {
    display: inline-block; padding: 1.5mm 3mm;
    border-radius: 999px; font-size: 8pt; font-weight: 700; letter-spacing: 0.4px;
  }
  .pill-sev-high { background: #FEE2E2; color: #991B1B; }
  .pill-sev-medium { background: #FEF3C7; color: #92400E; }
  .pill-sev-low { background: #D1FAE5; color: #065F46; }
  .pill-mkt { background: #DBEAFE; color: #1E40AF; }
  .pill-dev { background: #FCE7F3; color: #9D174D; }
  .pill-where { background: #F1F5F9; color: #475569; }

  /* Big-number callouts (exec summary) */
  .stat-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; margin: 5mm 0; }
  .stat-card {
    background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8pt;
    padding: 4mm 5mm; text-align: center;
  }
  .stat-num { font-size: 26pt; font-weight: 800; line-height: 1; color: #0F172A; }
  .stat-num.high { color: #B91C1C; } .stat-num.medium { color: #B45309; } .stat-num.low { color: #047857; }
  .stat-label { font-size: 8pt; color: #64748B; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; margin-top: 2mm; }

  /* AI narrative box */
  .narrative {
    background: linear-gradient(135deg, #EFF6FF 0%, #F0F9FF 100%);
    border-left: 4px solid #2563EB;
    border-radius: 0 8pt 8pt 0;
    padding: 5mm 6mm;
    margin: 5mm 0;
  }
  .narrative-headline {
    font-size: 14pt; font-weight: 800; color: #0F172A;
    margin-bottom: 3mm; line-height: 1.3;
    letter-spacing: -0.01em;
  }
  .narrative-body {
    font-size: 11pt; color: #1E3A8A; line-height: 1.65;
  }

  /* Strengths */
  .strengths-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; }
  .strength {
    background: #ECFDF5; border-left: 3pt solid #10B981;
    padding: 3mm 4mm; border-radius: 0 6pt 6pt 0;
    font-size: 10pt; color: #064E3B;
  }

  /* Top 3 fixes (Pareto) */
  .top-fixes { margin: 5mm 0; }
  .top-fix {
    display: grid; grid-template-columns: 10mm 1fr; gap: 4mm;
    padding: 4mm 5mm; margin-bottom: 3mm;
    background: #FFF7ED; border: 1px solid #FCD34D;
    border-radius: 8pt;
    page-break-inside: avoid;
  }
  .top-fix-num {
    font-size: 22pt; font-weight: 900; line-height: 1;
    color: #B45309; text-align: center;
  }
  .top-fix-title { font-weight: 700; color: #1F2937; font-size: 11pt; margin-bottom: 1mm; line-height: 1.3; }
  .top-fix-where { color: #92400E; font-size: 8.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2mm; }
  .top-fix-rationale { color: #4B5563; font-size: 10pt; line-height: 1.55; }

  /* Quick Wins */
  .qw-grid { display: grid; gap: 3mm; }
  .qw {
    display: grid; grid-template-columns: 16mm 1fr 22mm; gap: 4mm;
    padding: 4mm 5mm; background: #F0FDF4; border: 1px solid #86EFAC;
    border-radius: 8pt; align-items: center;
    page-break-inside: avoid;
  }
  .qw-time {
    background: #10B981; color: #FFFFFF;
    border-radius: 6pt;
    padding: 2.5mm 0;
    text-align: center;
    font-weight: 800; font-size: 10pt;
  }
  .qw-task { font-weight: 700; color: #064E3B; font-size: 10.5pt; line-height: 1.4; }
  .qw-impact { font-size: 9pt; color: #047857; margin-top: 1mm; line-height: 1.5; }
  .qw-badge {
    background: #FFFFFF; border: 1px solid #86EFAC;
    color: #047857; font-weight: 700; font-size: 8pt;
    padding: 1.5mm 2mm; border-radius: 999px; text-align: center;
    text-transform: uppercase; letter-spacing: 0.5px;
  }

  /* Issue cards */
  .track-section { margin-top: 7mm; }
  .track-header {
    display: flex; align-items: center; gap: 3mm;
    padding: 3mm 4mm; background: #F1F5F9; border-radius: 6pt;
    margin-bottom: 4mm;
  }
  .track-header-icon { font-size: 13pt; }
  .track-header-text { font-weight: 700; font-size: 11pt; color: #0F172A; }
  .track-header-sub { font-size: 9pt; color: #64748B; }
  .severity-group-title {
    font-size: 9.5pt; font-weight: 800; color: #475569;
    text-transform: uppercase; letter-spacing: 1.5px;
    margin: 5mm 0 2mm; display: flex; align-items: center; gap: 2mm;
  }
  .severity-dot { width: 7pt; height: 7pt; border-radius: 50%; }
  .issue-card {
    border: 1px solid #E2E8F0; border-radius: 8pt; padding: 4.5mm;
    margin-bottom: 3mm; background: #FFFFFF;
    page-break-inside: avoid; break-inside: avoid;
    border-left: 4pt solid #94A3B8;
  }
  .issue-card.high { border-left-color: #EF4444; }
  .issue-card.medium { border-left-color: #F59E0B; }
  .issue-card.low { border-left-color: #10B981; }
  .issue-flag {
    font-weight: 700; color: #0F172A; font-size: 11pt;
    margin-bottom: 2.5mm; line-height: 1.35;
  }
  .issue-meta { display: flex; flex-wrap: wrap; gap: 2mm; margin-bottom: 3mm; }
  .issue-row {
    display: grid; grid-template-columns: 26mm 1fr; gap: 3mm;
    padding: 1.8mm 0; border-top: 1px solid #F1F5F9;
  }
  .issue-row-label {
    font-size: 8pt; color: #64748B; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.5px;
  }
  .issue-row-text { font-size: 10pt; color: #1E293B; line-height: 1.55; }
  .issue-pages-list {
    margin-top: 2mm;
    background: #F8FAFC; border-radius: 5pt; padding: 2.5mm 3.5mm;
    font-size: 8.5pt; color: #475569;
  }
  .issue-pages-list ul { margin: 0; padding-left: 5mm; }

  /* Effort/Impact 2x2 matrix */
  .matrix {
    margin: 5mm 0;
    background: #F8FAFC; border-radius: 8pt;
    padding: 5mm 6mm;
  }
  .matrix-svg-wrap { display: flex; justify-content: center; }
  .matrix-legend { font-size: 8.5pt; color: #64748B; text-align: center; margin-top: 3mm; }

  /* Roadmap (30/60/90) */
  .roadmap-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4mm; margin: 5mm 0; }
  .roadmap-col {
    background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8pt;
    padding: 5mm 5mm 6mm; page-break-inside: avoid;
  }
  .roadmap-col.first { border-top: 4px solid #EF4444; }
  .roadmap-col.second { border-top: 4px solid #F59E0B; }
  .roadmap-col.third { border-top: 4px solid #10B981; }
  .roadmap-window {
    font-size: 8pt; color: #64748B; font-weight: 800;
    text-transform: uppercase; letter-spacing: 1.5px;
  }
  .roadmap-title { font-size: 14pt; font-weight: 800; color: #0F172A; margin: 1mm 0 4mm; line-height: 1; }
  .roadmap-list { list-style: none; padding: 0; margin: 0; }
  .roadmap-list li {
    padding: 2.5mm 0 2.5mm 0;
    font-size: 10pt; color: #1E293B;
    border-top: 1px solid #F1F5F9; line-height: 1.45;
  }
  .roadmap-list li:first-child { border-top: 0; }
  .roadmap-list li::before { content: '→  '; color: #94A3B8; font-weight: 700; }

  /* Per-page card with thumbnail */
  .page-card {
    border: 1px solid #E2E8F0; border-radius: 8pt; padding: 0;
    margin-bottom: 5mm; background: #FFFFFF;
    page-break-inside: avoid; break-inside: avoid;
    overflow: hidden;
  }
  .page-card-grid {
    display: grid;
    grid-template-columns: 60mm 1fr;
  }
  .page-thumb {
    background: #F1F5F9; border-right: 1px solid #E2E8F0;
    overflow: hidden; max-height: 70mm;
    display: flex; align-items: flex-start; justify-content: center;
  }
  .page-thumb img { width: 100%; height: auto; display: block; }
  .page-thumb-empty {
    width: 100%; height: 60mm; display: flex; align-items: center;
    justify-content: center; color: #94A3B8; font-size: 9pt; padding: 4mm; text-align: center;
  }
  .page-card-body { padding: 4.5mm 5mm; }
  .page-card-head {
    display: flex; justify-content: space-between; align-items: center;
    border-bottom: 1px solid #F1F5F9; padding-bottom: 2.5mm; margin-bottom: 3mm;
  }
  .page-card-name { font-weight: 700; font-size: 11pt; color: #0F172A; line-height: 1.2; }
  .page-card-url { font-size: 8pt; color: #94A3B8; margin-top: 1mm; word-break: break-all; }
  .page-score-chip {
    background: #F1F5F9; padding: 1.5mm 4mm; border-radius: 999px;
    font-size: 13pt; font-weight: 800; color: #0F172A;
  }
  .page-score-chip.high { background: #ECFDF5; color: #047857; }
  .page-score-chip.med { background: #FEF3C7; color: #B45309; }
  .page-score-chip.low { background: #FEE2E2; color: #B91C1C; }
  .page-subscores { display: flex; gap: 2mm; margin: 2mm 0 3mm; }
  .page-subscore {
    flex: 1; background: #F8FAFC; padding: 2mm 3mm;
    border-radius: 5pt; border: 1px solid #E2E8F0;
  }
  .page-subscore-label { font-size: 7pt; color: #64748B; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
  .page-subscore-value { font-size: 12pt; font-weight: 800; color: #0F172A; line-height: 1; margin-top: 1mm; }
  .check-row { display: flex; flex-wrap: wrap; gap: 1.5mm; margin-top: 1.5mm; }
  .check-pill {
    padding: 1mm 2.5mm; border-radius: 999px; font-size: 8pt; font-weight: 600;
  }
  .check-pill.yes { background: #ECFDF5; color: #065F46; }
  .check-pill.no { background: #FEF2F2; color: #991B1B; }
  .check-pill.neutral { background: #F1F5F9; color: #475569; }

  /* URL structure table */
  .url-table { font-size: 9pt; }
  .url-table th {
    text-align: left; padding: 2.5mm 2.5mm; background: #F8FAFC;
    color: #475569; font-weight: 800; font-size: 8.5pt;
    text-transform: uppercase; letter-spacing: 0.5px;
    border-bottom: 2px solid #E2E8F0;
  }
  .url-table td {
    padding: 2mm 2.5mm; border-bottom: 1px solid #F1F5F9;
    color: #1E293B;
  }
  .url-table .yes { color: #059669; font-weight: 800; }
  .url-table .no { color: #DC2626; font-weight: 800; }
  .grade-pill {
    display: inline-block; padding: 0.5mm 2mm; border-radius: 4pt;
    font-weight: 800; font-size: 8.5pt;
  }
  .grade-A { background: #D1FAE5; color: #065F46; }
  .grade-B { background: #FEF3C7; color: #78350F; }
  .grade-D, .grade-F { background: #FEE2E2; color: #991B1B; }

  /* Nav & Journey */
  .nav-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
  .nav-block-title {
    font-size: 10.5pt; font-weight: 800; color: #0F172A;
    margin-bottom: 3mm; padding-bottom: 2mm;
    border-bottom: 2px solid #E2E8F0;
  }
  .nav-list { list-style: none; padding: 0; margin: 0; }
  .nav-list li {
    padding: 1.5mm 0; font-size: 9.5pt; color: #1E293B;
    display: flex; align-items: center; gap: 3mm;
  }
  .nav-list li .nav-text { flex: 1; }
  .nav-list li .nav-href { font-size: 8pt; color: #94A3B8; font-family: 'JetBrains Mono', monospace; }
  .checklist-item {
    display: flex; align-items: flex-start; gap: 3mm;
    padding: 2mm 0; border-bottom: 1px solid #F1F5F9;
    font-size: 9.5pt;
  }
  .checklist-item:last-child { border-bottom: 0; }
  .checklist-icon { width: 5mm; flex-shrink: 0; font-size: 11pt; }
  .checklist-label { flex: 1; color: #334155; }

  /* Note callouts */
  .callout {
    background: #EFF6FF; border-left: 3pt solid #3B82F6;
    padding: 3mm 4mm; border-radius: 0 5pt 5pt 0;
    font-size: 9.5pt; color: #1E40AF; margin: 4mm 0;
  }
</style>`;

// ─── COVER ────────────────────────────────────────────────────────────

function renderCover(client, scoring, audit) {
  const date = new Date(audit.runAt).toISOString().slice(0, 10);
  const gradeBg = scoring.score >= 80 ? '#D1FAE5;color:#065F46'
    : scoring.score >= 65 ? '#FEF3C7;color:#92400E'
    : '#FEE2E2;color:#991B1B';
  const home = (audit.pages || [])[0];
  const heroB64 = home?.heroDesktopB64;
  const headline = audit.narrative?.headline || `${scoring.status} — ${scoring.score}/100 site health, ranked findings inside.`;

  return `
  <div class="cover">
    <div class="cover-left">
      <div>
        <div class="cover-brand">Allied Health Media</div>
        <div class="cover-eyebrow">Website QA · Performance · SEO · CRO</div>
        <h1 class="cover-title">${esc(client.name)}</h1>
        <div class="cover-headline">${esc(headline)}</div>
      </div>
      <div class="cover-meta">
        <div class="cover-meta-block">
          <div class="cover-meta-label">Site</div>
          <div class="cover-meta-value">${esc(client.url.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</div>
        </div>
        <div class="cover-meta-block">
          <div class="cover-meta-label">Audited</div>
          <div class="cover-meta-value">${esc(date)}</div>
        </div>
        <div class="cover-meta-block">
          <div class="cover-meta-label">Pages</div>
          <div class="cover-meta-value">${audit.pages?.length || 0}</div>
        </div>
        <div class="cover-meta-block">
          <div class="cover-meta-label">Status</div>
          <div class="cover-meta-value">${esc(client.status)}</div>
        </div>
      </div>
    </div>
    <div class="cover-right">
      <div class="cover-screenshot">
        ${heroB64
          ? `<img src="data:image/jpeg;base64,${heroB64}" alt="Homepage screenshot"/>`
          : `<div class="cover-screenshot-empty">Homepage screenshot unavailable</div>`}
      </div>
    </div>
    <div class="cover-score-card">
      <div class="cover-score-label">Overall Health</div>
      <div class="cover-score-num">${scoring.score}</div>
      <div class="cover-score-status">${esc(scoring.status)}</div>
      <span class="cover-score-grade" style="background:${gradeBg}">Grade ${esc(scoring.grade)}</span>
    </div>
  </div>`;
}

// ─── EXECUTIVE SUMMARY ────────────────────────────────────────────────

function renderExecSummary(client, audit, scoring, issues, narrative, pageNum) {
  const lh = audit.lighthouse || {};
  const m = lh.mobile?.scores || {};
  const d = lh.desktop?.scores || {};
  const grouped = groupIssues(issues);
  const high = grouped.filter((g) => g.severity === 'high').length;
  const medium = grouped.filter((g) => g.severity === 'medium').length;
  const low = grouped.filter((g) => g.severity === 'low').length;

  const lhCard = (label, mv, dv) => `
    <div class="lh-card">
      <div class="lh-card-label">${label}</div>
      <div class="lh-card-row"><span class="lh-card-strategy">Mobile</span>${miniBar(mv)}</div>
      <div class="lh-card-row"><span class="lh-card-strategy">Desktop</span>${miniBar(dv)}</div>
    </div>`;

  const narrativeBlock = narrative
    ? `<div class="narrative">
         <div class="narrative-headline">${esc(narrative.headline || '')}</div>
         <div class="narrative-body">${esc(narrative.executiveParagraph || '')}</div>
       </div>`
    : `<p class="lede">This audit checked <strong>${audit.pages?.length || 0}</strong> pages on ${esc(client.url)} for performance, SEO, conversion-rate optimisation, accessibility and AHM compliance. Below: the headline numbers, ranked fixes, and a 30/60/90 plan.</p>`;

  const topFixes = pickTopFixes(issues, 3);
  const fixCards = topFixes.map((f, i) => {
    const flag = (f.examples && f.examples[0]) || f.flag;
    const where = f.occurrences > 1 ? `${f.occurrences} pages affected` : (f.wheres && f.wheres[0]) || f.where;
    const aiRationale = narrative?.ifYouFixThree?.[i]?.why;
    return `
      <div class="top-fix">
        <div class="top-fix-num">${i + 1}</div>
        <div>
          <div class="top-fix-title">${esc(flag)}</div>
          <div class="top-fix-where">${esc(where)}</div>
          ${aiRationale
            ? `<div class="top-fix-rationale">${esc(aiRationale)}</div>`
            : f.howToFix ? `<div class="top-fix-rationale">→ ${esc(f.howToFix)}</div>` : ''}
        </div>
      </div>`;
  }).join('');

  return `
  <div class="page">
    <div class="brand-strip"></div>
    <div class="section-eyebrow">Executive Summary</div>
    <h2>The verdict</h2>
    <hr class="divider"/>

    ${narrativeBlock}

    <div style="display:flex; gap:8mm; align-items:center; margin: 4mm 0 5mm;">
      ${scoreGauge(scoring.score, scoring.grade, 130)}
      <div style="flex:1;">
        <div class="stat-row" style="margin:0;">
          <div class="stat-card"><div class="stat-num high">${high}</div><div class="stat-label">High Impact</div></div>
          <div class="stat-card"><div class="stat-num medium">${medium}</div><div class="stat-label">Medium Impact</div></div>
          <div class="stat-card"><div class="stat-num low">${low}</div><div class="stat-label">Observations</div></div>
        </div>
      </div>
    </div>

    <h3>Lighthouse Scoreboard</h3>
    <div class="lh-grid">
      ${lhCard('Performance', m.performance, d.performance)}
      ${lhCard('Accessibility', m.accessibility, d.accessibility)}
      ${lhCard('Best Practices', m.bestPractices, d.bestPractices)}
      ${lhCard('SEO (technical)', m.seo, d.seo)}
    </div>
    ${lh.mobile?.metrics ? `
      <div class="callout">
        <strong>Mobile Core Web Vitals:</strong>
        LCP ${esc(lh.mobile.metrics.lcp || '—')} ·
        CLS ${esc(lh.mobile.metrics.cls || '—')} ·
        TBT ${esc(lh.mobile.metrics.tbt || '—')} ·
        FCP ${esc(lh.mobile.metrics.fcp || '—')} ·
        Speed Index ${esc(lh.mobile.metrics.speedIndex || '—')}
      </div>` : ''}

    ${topFixes.length ? `
      <h3 style="margin-top:6mm;">🎯 If You Fix Only Three Things</h3>
      <div class="top-fixes">${fixCards}</div>` : ''}

    <div class="footer">
      <span>${esc(client.name)} · ${esc(client.url)}</span>
      <span>${pageNum} · Executive Summary</span>
    </div>
  </div>`;
}

// ─── STRENGTHS ────────────────────────────────────────────────────────

function renderStrengths(strengths, client, pageNum) {
  if (!strengths.length) return '';
  return `
  <div class="page">
    <div class="brand-strip"></div>
    <div class="section-eyebrow">What's working</div>
    <h2>Strengths</h2>
    <hr class="divider"/>
    <p class="lede">A balanced report leads with what's already strong. Below is what this site is doing right — credit where it's due before we look at the gaps.</p>
    <div class="strengths-grid">
      ${strengths.map((s) => `<div class="strength">✓ ${esc(s)}</div>`).join('')}
    </div>
    <div class="footer">
      <span>${esc(client.name)} · ${esc(client.url)}</span>
      <span>${pageNum} · Strengths</span>
    </div>
  </div>`;
}

// ─── QUICK WINS ───────────────────────────────────────────────────────

function renderQuickWins(narrative, client, pageNum) {
  if (!narrative?.quickWins || narrative.quickWins.length === 0) return '';
  return `
  <div class="page">
    <div class="brand-strip"></div>
    <div class="section-eyebrow">Easy leverage</div>
    <h2>Quick Wins</h2>
    <hr class="divider"/>
    <p class="lede">Each of these takes under an hour and moves a real metric — booking rate, search ranking, or trust. Action these first.</p>
    <div class="qw-grid">
      ${narrative.quickWins.map((w) => `
        <div class="qw">
          <div class="qw-time">${esc(w.minutes ?? '—')}<div style="font-size:7pt;font-weight:600;letter-spacing:0.5px;margin-top:0.5mm;">MIN</div></div>
          <div>
            <div class="qw-task">${esc(w.task || '')}</div>
            ${w.impact ? `<div class="qw-impact">→ ${esc(w.impact)}</div>` : ''}
          </div>
          <div class="qw-badge">≤ 1 hour</div>
        </div>
      `).join('')}
    </div>
    <div class="footer">
      <span>${esc(client.name)} · ${esc(client.url)}</span>
      <span>${pageNum} · Quick Wins</span>
    </div>
  </div>`;
}

// ─── ISSUES & FIXES ───────────────────────────────────────────────────

function renderIssueCard(group) {
  const flag = (group.examples && group.examples[0]) || group.flag;
  const wheresHtml = group.occurrences === 1
    ? `<span class="pill pill-where">📍 ${esc(group.wheres[0])}</span>`
    : `<span class="pill pill-where">📍 ${group.occurrences} pages</span>`;
  return `
    <div class="issue-card ${group.severity}">
      <div class="issue-flag">${esc(flag)}</div>
      <div class="issue-meta">
        <span class="pill pill-sev-${group.severity}">${sevLabel(group.severity)}</span>
        ${trackPill(group.track)}
        ${wheresHtml}
      </div>
      ${group.rootCause ? `<div class="issue-row"><div class="issue-row-label">Root cause</div><div class="issue-row-text">${esc(group.rootCause)}</div></div>` : ''}
      ${group.howToFix ? `<div class="issue-row"><div class="issue-row-label">How to fix</div><div class="issue-row-text">${esc(group.howToFix)}</div></div>` : ''}
      ${group.businessImpact ? `<div class="issue-row"><div class="issue-row-label">Business impact</div><div class="issue-row-text">${esc(group.businessImpact)}</div></div>` : ''}
      ${group.occurrences > 1 ? `
        <div class="issue-pages-list">
          <strong>Affected pages (${group.occurrences}):</strong>
          <ul>${group.wheres.slice(0, 12).map((w) => `<li>${esc(w)}</li>`).join('')}${group.wheres.length > 12 ? `<li><em>+ ${group.wheres.length - 12} more</em></li>` : ''}</ul>
        </div>` : ''}
    </div>`;
}

function renderIssuesPage(issues, client, pageNum) {
  const grouped = groupIssues(issues);
  const tracks = {
    marketing: grouped.filter((g) => g.track === 'marketing'),
    dev: grouped.filter((g) => g.track === 'dev'),
  };
  const sortFn = (a, b) => {
    const r = { high: 0, medium: 1, low: 2 };
    if (r[a.severity] !== r[b.severity]) return r[a.severity] - r[b.severity];
    return b.occurrences - a.occurrences;
  };
  tracks.marketing.sort(sortFn);
  tracks.dev.sort(sortFn);

  const renderTrack = (issues, title, icon, sub) => {
    if (!issues.length) return `
      <div class="track-section">
        <div class="track-header"><span class="track-header-icon">${icon}</span>
          <div><div class="track-header-text">${title}</div><div class="track-header-sub">${sub}</div></div>
        </div>
        <p style="color:#94A3B8; font-style:italic;">No ${title.toLowerCase()} issues found.</p>
      </div>`;
    const bySev = { high: issues.filter((i) => i.severity === 'high'), medium: issues.filter((i) => i.severity === 'medium'), low: issues.filter((i) => i.severity === 'low') };
    const sevBlock = (sev, label) => bySev[sev].length === 0 ? '' : `
      <div class="severity-group-title"><span class="severity-dot" style="background:${sevColor(sev)}"></span>${label}</div>
      ${bySev[sev].map(renderIssueCard).join('')}`;
    return `
      <div class="track-section">
        <div class="track-header"><span class="track-header-icon">${icon}</span>
          <div><div class="track-header-text">${title}</div><div class="track-header-sub">${sub}</div></div>
        </div>
        ${sevBlock('high', 'High Impact')}
        ${sevBlock('medium', 'Medium Impact')}
        ${sevBlock('low', 'Observations')}
      </div>`;
  };

  return `
  <div class="page">
    <div class="brand-strip"></div>
    <div class="section-eyebrow">Action plan</div>
    <h2>Issues &amp; Fixes</h2>
    <hr class="divider"/>
    <p class="lede">Each issue includes severity, where it occurs, root cause, the exact fix, and the business impact. Issues are split by who can fix them — so the consultant or CSM can act on marketing-track items immediately, while dev-team items get scoped to a developer.</p>
    ${renderTrack(tracks.marketing, 'Marketing / CSM Track', '✍️', 'Fixes the consultant or CSM can action through WordPress admin or content updates.')}
    ${renderTrack(tracks.dev, 'Development Team Track', '🛠️', 'Fixes that need a developer / agency — code, hosting, plugins, schema.')}
    <div class="footer">
      <span>${esc(client.name)} · ${esc(client.url)}</span>
      <span>${pageNum} · Issues &amp; Fixes</span>
    </div>
  </div>`;
}

// ─── EFFORT/IMPACT MATRIX ──────────────────────────────────────────────
//
// Plot top issues on a 2x2 (effort vs impact). Effort estimate is heuristic:
//   - dev-track + screenshots/perf = high effort
//   - marketing-track copy/meta = low effort
// Impact = severity (high/medium/low → 90/55/20)
function effortFor(issue) {
  if (issue.track === 'dev') return 0.7;
  const f = String(issue.flag || '').toLowerCase();
  if (/title|meta description|h1|focus keyword|footer|privacy|terms|cookie|gmc|alt text|stock filename|booking|tap-to-call|form/i.test(f)) return 0.25;
  if (/schema|canonical|gtm|analytics|json-ld|viewport/i.test(f)) return 0.55;
  return 0.4;
}
function impactFor(issue) {
  const sev = issue.severity === 'high' ? 0.85 : issue.severity === 'medium' ? 0.55 : 0.2;
  // Boost impact for issues affecting many pages
  const occBoost = Math.min((issue.occurrences || 1) * 0.04, 0.15);
  return Math.min(sev + occBoost, 0.95);
}

function renderImpactMatrix(issues, client, pageNum) {
  const grouped = groupIssues(issues).slice().sort((a, b) => {
    const r = { high: 0, medium: 1, low: 2 };
    if (r[a.severity] !== r[b.severity]) return r[a.severity] - r[b.severity];
    return b.occurrences - a.occurrences;
  }).slice(0, 12);
  if (grouped.length === 0) return '';

  const W = 460; const H = 320;
  const padL = 60; const padR = 30; const padT = 28; const padB = 60;
  const plotW = W - padL - padR; const plotH = H - padT - padB;

  // Quadrant backgrounds
  const quad = `
    <rect x="${padL}" y="${padT}" width="${plotW / 2}" height="${plotH / 2}" fill="#ECFDF5"/>
    <rect x="${padL + plotW / 2}" y="${padT}" width="${plotW / 2}" height="${plotH / 2}" fill="#FEF3C7"/>
    <rect x="${padL}" y="${padT + plotH / 2}" width="${plotW / 2}" height="${plotH / 2}" fill="#F1F5F9"/>
    <rect x="${padL + plotW / 2}" y="${padT + plotH / 2}" width="${plotW / 2}" height="${plotH / 2}" fill="#FAFAFA"/>
  `;

  const quadLabels = `
    <text x="${padL + 8}" y="${padT + 14}" font-size="9" font-weight="800" fill="#047857">QUICK WINS</text>
    <text x="${padL + plotW - 8}" y="${padT + 14}" text-anchor="end" font-size="9" font-weight="800" fill="#92400E">STRATEGIC BETS</text>
    <text x="${padL + 8}" y="${padT + plotH - 6}" font-size="9" font-weight="800" fill="#64748B">FILL-INS</text>
    <text x="${padL + plotW - 8}" y="${padT + plotH - 6}" text-anchor="end" font-size="9" font-weight="800" fill="#94A3B8">DEPRIORITISE</text>
  `;

  // Cross gridlines
  const cross = `
    <line x1="${padL + plotW / 2}" y1="${padT}" x2="${padL + plotW / 2}" y2="${padT + plotH}" stroke="#CBD5E1" stroke-width="1" stroke-dasharray="3 3"/>
    <line x1="${padL}" y1="${padT + plotH / 2}" x2="${padL + plotW}" y2="${padT + plotH / 2}" stroke="#CBD5E1" stroke-width="1" stroke-dasharray="3 3"/>
  `;

  // Axis labels
  const axes = `
    <line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" stroke="#0F172A" stroke-width="1.5"/>
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="#0F172A" stroke-width="1.5"/>
    <text x="${padL + plotW / 2}" y="${H - 16}" text-anchor="middle" font-size="10" font-weight="700" fill="#0F172A">EFFORT TO FIX →</text>
    <text x="${padL - 12}" y="${padT + 4}" text-anchor="end" font-size="9" font-weight="600" fill="#64748B">High</text>
    <text x="${padL - 12}" y="${padT + plotH}" text-anchor="end" font-size="9" font-weight="600" fill="#64748B">Low</text>
    <text x="${padL + 6}" y="${padT + plotH + 14}" font-size="9" font-weight="600" fill="#64748B">Quick</text>
    <text x="${padL + plotW - 6}" y="${padT + plotH + 14}" text-anchor="end" font-size="9" font-weight="600" fill="#64748B">Major</text>
    <text x="${padL - 32}" y="${padT + plotH / 2}" text-anchor="middle" font-size="10" font-weight="700" fill="#0F172A" transform="rotate(-90 ${padL - 32} ${padT + plotH / 2})">↑ IMPACT</text>
  `;

  // Plot points
  const points = grouped.map((g, i) => {
    const ex = effortFor(g);
    const im = impactFor(g);
    const x = padL + ex * plotW;
    const y = padT + (1 - im) * plotH;
    const color = sevColor(g.severity);
    return `
      <circle cx="${x}" cy="${y}" r="11" fill="${color}" opacity="0.85" stroke="#FFFFFF" stroke-width="2"/>
      <text x="${x}" y="${y + 4}" text-anchor="middle" font-size="10" font-weight="800" fill="#FFFFFF">${i + 1}</text>
    `;
  }).join('');

  const legend = grouped.map((g, i) => {
    const flag = (g.examples && g.examples[0]) || g.flag;
    const trimmed = flag.length > 60 ? flag.slice(0, 57) + '…' : flag;
    return `
      <div style="display:flex; gap:3mm; align-items:flex-start; padding:1.5mm 0; font-size:9pt;">
        <div style="background:${sevColor(g.severity)}; color:#FFF; width:6mm; height:6mm; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:8pt; flex-shrink:0;">${i + 1}</div>
        <div style="flex:1; color:#1E293B;">${esc(trimmed)}</div>
      </div>`;
  }).join('');

  return `
  <div class="page">
    <div class="brand-strip"></div>
    <div class="section-eyebrow">Prioritisation</div>
    <h2>Effort &middot; Impact Matrix</h2>
    <hr class="divider"/>
    <p class="lede">The top ${grouped.length} issues from this audit, plotted by how much effort each fix takes against the business impact it unlocks. Quick Wins (top-left) are where to start — high impact, low cost.</p>
    <div class="matrix">
      <div class="matrix-svg-wrap">
        <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
          ${quad}${cross}${quadLabels}${axes}${points}
        </svg>
      </div>
    </div>
    <h3 style="margin-top:6mm;">Plotted issues</h3>
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 0 10mm;">
      <div>${legend.split('</div>').slice(0, Math.ceil(grouped.length / 2)).map((s) => s + '</div>').join('')}</div>
      <div>${legend.split('</div>').slice(Math.ceil(grouped.length / 2)).filter(Boolean).map((s) => s + '</div>').join('')}</div>
    </div>
    <div class="footer">
      <span>${esc(client.name)} · ${esc(client.url)}</span>
      <span>${pageNum} · Effort/Impact</span>
    </div>
  </div>`;
}

// ─── 30/60/90 ROADMAP ─────────────────────────────────────────────────

function renderRoadmap(narrative, issues, client, pageNum) {
  let thirty, sixty, ninety;
  if (narrative?.thirtyDays?.length) {
    thirty = narrative.thirtyDays;
    sixty = narrative.sixtyDays || [];
    ninety = narrative.ninetyDays || [];
  } else {
    // Fallback: derive from severity buckets
    const grouped = groupIssues(issues).sort((a, b) => {
      const r = { high: 0, medium: 1, low: 2 };
      if (r[a.severity] !== r[b.severity]) return r[a.severity] - r[b.severity];
      return b.occurrences - a.occurrences;
    });
    thirty = grouped.filter((g) => g.severity === 'high').slice(0, 5).map((g) => g.howToFix || g.flag);
    sixty = grouped.filter((g) => g.severity === 'medium').slice(0, 5).map((g) => g.howToFix || g.flag);
    ninety = grouped.filter((g) => g.severity === 'low').slice(0, 5).map((g) => g.howToFix || g.flag);
  }

  const col = (cls, window, title, items) => `
    <div class="roadmap-col ${cls}">
      <div class="roadmap-window">${esc(window)}</div>
      <div class="roadmap-title">${esc(title)}</div>
      <ul class="roadmap-list">
        ${items.length ? items.map((s) => `<li>${esc(s)}</li>`).join('') : '<li style="color:#94A3B8;font-style:italic;">No items in this window.</li>'}
      </ul>
    </div>`;

  return `
  <div class="page">
    <div class="brand-strip"></div>
    <div class="section-eyebrow">Action plan over time</div>
    <h2>30 · 60 · 90 Day Roadmap</h2>
    <hr class="divider"/>
    <p class="lede">A sequenced plan to take this site from its current state to fully optimised. The first 30 days focus on critical fixes that prevent lost revenue today; the next 60 days harden the foundation; the final 30 days are momentum and growth.</p>
    <div class="roadmap-grid">
      ${col('first', '0 — 30 days', 'Stop the bleed', thirty)}
      ${col('second', '30 — 60 days', 'Solidify', sixty)}
      ${col('third', '60 — 90 days', 'Compound', ninety)}
    </div>
    <div class="footer">
      <span>${esc(client.name)} · ${esc(client.url)}</span>
      <span>${pageNum} · 30/60/90</span>
    </div>
  </div>`;
}

// ─── PER-PAGE ──────────────────────────────────────────────────────────

function renderPerPage(client, audit, scoring, pageNum) {
  const cards = audit.pages.map((page, i) => {
    const ps = scoring.pageScores[i] || {};
    const label = pageLabel(client, page);
    const seo = page.seo || {};
    const cro = seo.cro || {};
    const compliance = seo.compliance || {};
    const scoreClass = ps.score >= 80 ? 'high' : ps.score >= 65 ? 'med' : 'low';
    const yn = (b) => b ? '<span class="check-pill yes">✓</span>' : '<span class="check-pill no">✗</span>';

    const subscores = ps.breakdown && !ps.breakdown.broken ? `
      <div class="page-subscores">
        <div class="page-subscore"><div class="page-subscore-label">SEO</div><div class="page-subscore-value">${ps.breakdown.seo}</div></div>
        <div class="page-subscore"><div class="page-subscore-label">Compl.</div><div class="page-subscore-value">${ps.breakdown.compliance}</div></div>
        <div class="page-subscore"><div class="page-subscore-label">CRO</div><div class="page-subscore-value">${ps.breakdown.cro}</div></div>
      </div>` : '';

    const thumb = page.heroDesktopB64
      ? `<img src="data:image/jpeg;base64,${page.heroDesktopB64}" alt="${esc(label)}"/>`
      : `<div class="page-thumb-empty">screenshot unavailable</div>`;

    return `
      <div class="page-card">
        <div class="page-card-grid">
          <div class="page-thumb">${thumb}</div>
          <div class="page-card-body">
            <div class="page-card-head">
              <div>
                <div class="page-card-name">${esc(label)}</div>
                <div class="page-card-url">${esc(page.url)}</div>
              </div>
              <div class="page-score-chip ${scoreClass}">${ps.score ?? '—'}</div>
            </div>
            ${subscores}
            <div style="font-size:9pt; line-height:1.5;">
              <div style="margin-bottom:2mm;"><strong style="color:#64748B;">Title:</strong> ${esc(seo.title || '—')}${seo.title ? ` <span style="color:#94A3B8">(${seo.title.length})</span>` : ''}</div>
              <div style="margin-bottom:2mm;"><strong style="color:#64748B;">Meta:</strong> ${esc((seo.metaDescription || '—').slice(0, 120))}${seo.metaDescription && seo.metaDescription.length > 120 ? '…' : ''}</div>
              <div style="margin-bottom:2mm;"><strong style="color:#64748B;">H1:</strong> ${esc(seo.firstH1 || '—')}</div>
            </div>
            <div style="margin-top:2mm;">
              <div class="check-row">
                ${yn(compliance.footerAhm)} <span style="font-size:8pt;color:#475569;align-self:center;">AHM</span>
                ${yn(compliance.privacy)} <span style="font-size:8pt;color:#475569;align-self:center;">Priv</span>
                ${yn(compliance.form)} <span style="font-size:8pt;color:#475569;align-self:center;">Form</span>
                ${yn(compliance.gtm || compliance.ga)} <span style="font-size:8pt;color:#475569;align-self:center;">Analytics</span>
                ${yn(cro.phoneClickable)} <span style="font-size:8pt;color:#475569;align-self:center;">Tel</span>
                ${yn(cro.bookingLink)} <span style="font-size:8pt;color:#475569;align-self:center;">Booking</span>
                ${yn(cro.testimonials || cro.starRating || cro.googleReviews)} <span style="font-size:8pt;color:#475569;align-self:center;">Social proof</span>
                ${yn(cro.medicalSchema || cro.localBusinessSchema)} <span style="font-size:8pt;color:#475569;align-self:center;">Schema</span>
                <span class="check-pill neutral">CTAs: ${cro.ctaButtonCount ?? 0}</span>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }).join('');

  return `
  <div class="page">
    <div class="brand-strip"></div>
    <div class="section-eyebrow">Page-level breakdown</div>
    <h2>Per-Page Analysis</h2>
    <hr class="divider"/>
    <p class="lede">Every audited page with a screenshot, individual score, and on-page check. The thumbnail shows what a visitor sees on first load — useful for catching layout issues by eye.</p>
    ${cards}
    <div class="footer">
      <span>${esc(client.name)} · ${esc(client.url)}</span>
      <span>${pageNum} · Per-Page Analysis</span>
    </div>
  </div>`;
}

// ─── URL STRUCTURE ────────────────────────────────────────────────────

function renderUrlStructure(client, audit, pageNum) {
  const rows = (audit.pages || []).map((page) => {
    const seo = page.seo || {};
    const slug = seo.slug || {};
    const yn = (b) => b ? '<span class="yes">✓</span>' : '<span class="no">✗</span>';
    const titleOk = !!seo.title && seo.title.length >= 25 && seo.title.length <= 70;
    const metaOk = !!seo.metaDescription && seo.metaDescription.length >= 70 && seo.metaDescription.length <= 175;
    const h1Ok = seo.h1Count === 1;
    const status = seo.status ?? (seo.error ? 'ERR' : '?');
    const grade = slug.grade || 'A';
    return `<tr>
      <td style="max-width:80mm;word-break:break-all;">${esc(pageLabel(client, page))}</td>
      <td>${slug.depth ?? '—'}</td>
      <td>${status}</td>
      <td>${yn(titleOk)}</td>
      <td>${yn(metaOk)}</td>
      <td>${yn(h1Ok)}</td>
      <td><span class="grade-pill grade-${grade.replace('+','')}">${grade}</span>${slug.reasons?.length ? `<div style="font-size:8pt;color:#94A3B8;">${esc(slug.reasons.join(', '))}</div>` : ''}</td>
    </tr>`;
  }).join('');

  const dupMap = new Map();
  for (const page of audit.pages || []) {
    const t = (page.seo?.title || '').trim();
    if (!t) continue;
    if (!dupMap.has(t)) dupMap.set(t, []);
    dupMap.get(t).push(page.url);
  }
  const dups = [...dupMap.entries()].filter(([, urls]) => urls.length > 1);

  return `
  <div class="page">
    <div class="brand-strip"></div>
    <div class="section-eyebrow">Indexability</div>
    <h2>URL Structure</h2>
    <hr class="divider"/>
    <table class="url-table">
      <thead><tr><th>Page</th><th>Depth</th><th>Status</th><th>Title</th><th>Meta</th><th>H1</th><th>Slug</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${dups.length ? `
      <h3 style="margin-top:8mm;">Duplicate &lt;title&gt; tags detected</h3>
      ${dups.map(([t, urls]) => `
        <div class="callout"><strong>"${esc(t)}"</strong> appears on:<br/>${urls.map(esc).join('<br/>')}</div>
      `).join('')}` : ''}
    <div class="footer">
      <span>${esc(client.name)} · ${esc(client.url)}</span>
      <span>${pageNum} · URL Structure</span>
    </div>
  </div>`;
}

// ─── NAV & JOURNEY ────────────────────────────────────────────────────

function renderJourney(client, audit, pageNum) {
  const home = (audit.pages || []).find((p) => p.url === client.url) || (audit.pages || [])[0];
  if (!home || !home.seo) return '';
  const seo = home.seo;
  const cro = seo.cro || {};
  const compliance = seo.compliance || {};
  const nav = seo.nav || [];
  const forms = seo.forms || { primaryFields: 0, formCount: 0 };
  const checkRow = (cond, label) => `
    <div class="checklist-item">
      <div class="checklist-icon">${cond ? '✅' : '❌'}</div>
      <div class="checklist-label">${esc(label)}</div>
    </div>`;
  return `
  <div class="page">
    <div class="brand-strip"></div>
    <div class="section-eyebrow">User experience</div>
    <h2>Navigation &amp; Patient Journey</h2>
    <hr class="divider"/>
    <div class="nav-grid">
      <div>
        <div class="nav-block-title">Top-Level Navigation</div>
        ${nav.length === 0 ? '<p style="color:#94A3B8; font-style:italic;">Could not detect a primary navigation menu.</p>' : `
          <ul class="nav-list">${nav.map((n) => `<li><span class="nav-text">${esc(n.text)}</span><span class="nav-href">${esc(n.href)}</span></li>`).join('')}</ul>`}
      </div>
      <div>
        <div class="nav-block-title">Conversion Path</div>
        ${checkRow(cro.phoneClickable, 'Phone (tap-to-call)')}
        ${checkRow(cro.emailClickable, 'Email link')}
        ${checkRow(cro.bookingLink, 'Booking CTA')}
        ${checkRow(forms.formCount > 0, `Contact form ${forms.formCount > 0 ? `(${forms.primaryFields} fields)${forms.primaryFields >= 8 ? ' ⚠️ long' : ''}` : ''}`)}
        <div class="checklist-item"><div class="checklist-icon">📊</div><div class="checklist-label">${cro.ctaButtonCount} CTA buttons on page</div></div>
      </div>
      <div>
        <div class="nav-block-title">Trust Signals</div>
        ${checkRow(cro.testimonials, 'Testimonials')}
        ${checkRow(cro.starRating, 'Star rating widgets')}
        ${checkRow(cro.googleReviews, 'Google Reviews / Trustpilot / Doctify')}
        ${checkRow(cro.gmcNumber, 'GMC number visible')}
        ${checkRow(cro.medicalSchema, 'Medical Schema.org')}
        ${checkRow(cro.localBusinessSchema, 'Local-Business Schema.org')}
      </div>
      <div>
        <div class="nav-block-title">Footer Compliance</div>
        ${checkRow(compliance.footerAhm, 'AHM credit')}
        ${checkRow(compliance.privacy, 'Privacy Policy')}
        ${checkRow(compliance.terms, 'Terms')}
        ${checkRow(compliance.cookie, 'Cookie Policy')}
        ${checkRow(compliance.gtm || compliance.ga, `Analytics ${compliance.gtm ? '(GTM)' : compliance.ga ? '(GA)' : ''}`)}
      </div>
    </div>
    <div class="footer">
      <span>${esc(client.name)} · ${esc(client.url)}</span>
      <span>${pageNum} · Navigation &amp; Journey</span>
    </div>
  </div>`;
}

// ─── MAIN ─────────────────────────────────────────────────────────────

function buildHtml(client, audit) {
  const scoring = siteScore(audit);
  const issues = gatherIssues(client, audit);
  const strengths = checkSiteStrengths(audit);
  const narrative = audit.narrative || null;

  const sections = [];
  let p = 0;
  sections.push(renderCover(client, scoring, audit));
  sections.push(renderExecSummary(client, audit, scoring, issues, narrative, ++p + 1));   // p=2
  if (strengths.length) { p++; sections.push(renderStrengths(strengths, client, p + 1)); }
  if (narrative?.quickWins?.length) { p++; sections.push(renderQuickWins(narrative, client, p + 1)); }
  p++; sections.push(renderIssuesPage(issues, client, p + 1));
  p++; sections.push(renderImpactMatrix(issues, client, p + 1));
  p++; sections.push(renderRoadmap(narrative, issues, client, p + 1));
  p++; sections.push(renderPerPage(client, audit, scoring, p + 1));
  p++; sections.push(renderUrlStructure(client, audit, p + 1));
  p++; sections.push(renderJourney(client, audit, p + 1));

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>${esc(client.name)} — Website QA</title>${STYLES}</head>
<body>
${sections.filter(Boolean).join('\n')}
</body></html>`;
}

module.exports = { buildHtml };
