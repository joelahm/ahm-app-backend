// AI-written bespoke narrative for the audit report.
// Calls Claude Sonnet with a structured summary of the audit and asks it
// to produce per-site editorial copy: headline verdict, executive paragraph,
// "if you fix only 3 things" rationale, curated quick wins, and a 30/60/90
// day roadmap.
//
// Returns null if ANTHROPIC_API_KEY is missing or the call fails — the
// report falls back to template copy in that case.

const Anthropic = require('@anthropic-ai/sdk');

let anthropic = null;
function getAnthropic() {
  if (anthropic) return anthropic;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  anthropic = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });
  return anthropic;
}

const SYSTEM = `You are a senior digital strategist at a UK healthcare marketing agency, writing a website audit report for a private medical consultant. Your tone is consultative, candid, and specific — not generic SEO-speak. You write like someone who has audited 100+ medical sites and knows what actually moves the needle for booking enquiries.

You will receive a structured summary of an automated audit (Lighthouse scores, on-page SEO/CRO findings, layout-vision review). Your job is to write the editorial layer that goes ON TOP of the data: a verdict, a personalised executive paragraph, a 3-fix priority rationale, a list of quick wins, and a 30/60/90 day roadmap.

Rules:
- Reference the consultant's specific name, specialism, and findings — never write generic copy that could fit any site.
- Be candid. If the site is good, say so. If it's broken, say it bluntly without being mean.
- Quantify business impact whenever possible (e.g. "~5 lost mobile enquiries/month", not "could affect conversions").
- Quick wins are tasks that take <1 hour AND have measurable impact. Do not include things that require dev work, paid tools, or content writing.
- Roadmap items should be ACTIONS, not findings. "Add tap-to-call to header" not "Header lacks tap-to-call".
- Headline verdict is one short sentence (<14 words) — sharp, evaluative.
- Executive paragraph is 4-6 sentences — frames the site's situation, biggest risk, and what to do first. Mention the consultant by name.
- Output ONLY a single JSON object matching the schema. No markdown, no prose outside the JSON.

Schema:
{
  "headline": "string (<14 words)",
  "executiveParagraph": "string (4-6 sentences)",
  "ifYouFixThree": [
    {"title": "<short fix name>", "why": "<1-2 sentence rationale specific to this site>"}
  ],
  "quickWins": [
    {"task": "<concrete action>", "minutes": <number>, "impact": "<one-line impact>"}
  ],
  "thirtyDays": ["<action 1>", "<action 2>", ...],
  "sixtyDays": ["<action 1>", "<action 2>", ...],
  "ninetyDays": ["<action 1>", "<action 2>", ...]
}`;

function summariseForPrompt(client, audit, scoring, issues, strengths) {
  // Trim to what the model actually needs — too much noise = generic output
  const lh = audit.lighthouse || {};
  const m = lh.mobile?.scores || {};
  const d = lh.desktop?.scores || {};
  const home = (audit.pages || [])[0]?.seo || {};

  return {
    consultant: client.name,
    url: client.url,
    specialism: client.team || '',
    pagesAudited: (audit.pages || []).length,
    overallScore: scoring.score,
    grade: scoring.grade,
    status: scoring.status,
    subscores: scoring.components,
    lighthouse: { mobile: m, desktop: d },
    coreWebVitals: lh.mobile?.metrics || null,
    homepageSnapshot: {
      title: home.title || null,
      metaDescription: home.metaDescription || null,
      h1: home.firstH1 || null,
      hasForm: !!home.compliance?.form,
      hasTapToCall: !!home.cro?.phoneClickable,
      hasBookingCTA: !!home.cro?.bookingLink,
      hasTestimonials: !!(home.cro?.testimonials || home.cro?.googleReviews),
      hasGmcNumber: !!home.cro?.gmcNumber,
      hasMedicalSchema: !!home.cro?.medicalSchema,
      ctaButtonCount: home.cro?.ctaButtonCount ?? 0,
      formFieldCount: home.forms?.primaryFields ?? 0,
    },
    topIssues: issues.slice(0, 12).map((i) => ({
      severity: i.severity,
      track: i.track,
      flag: i.flag,
      pages: i.occurrences || 1,
    })),
    strengths,
  };
}

async function writeNarrative({ client, audit, scoring, issues, strengths, log = () => {} }) {
  const a = getAnthropic();
  if (!a) { log('[narrative] no ANTHROPIC_API_KEY — skipping'); return null; }

  const summary = summariseForPrompt(client, audit, scoring, issues, strengths);

  try {
    const res = await a.messages.create({
      model: process.env.QA_NARRATIVE_MODEL || 'claude-sonnet-4-6',
      max_tokens: 2200,
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: `Audit summary for ${client.name} (${client.url}):\n\n` +
          '```json\n' + JSON.stringify(summary, null, 2) + '\n```\n\n' +
          'Now write the editorial layer per the schema.',
      }],
    });
    const raw = res.content?.find((b) => b.type === 'text')?.text || '';
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) { log('[narrative] no JSON in response'); return null; }
    const parsed = JSON.parse(m[0]);
    return parsed;
  } catch (err) {
    log(`[narrative] failed: ${err.message}`);
    return null;
  }
}

module.exports = { writeNarrative };
