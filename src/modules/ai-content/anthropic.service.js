const fs = require('fs/promises');
const path = require('path');

const sharp = require('sharp');

const { AppError } = require('../../lib/errors');

const ANTHROPIC_VERSION = '2023-06-01';
// Anthropic accepts images up to 8000x8000 inline. Push close to that ceiling
// so we ship the highest-quality input the API permits for tall multi-section
// page designs. NOTE: Anthropic still downsamples internally to roughly 1568
// on the long edge, so single-image extraction of tiny text (eyebrows, "Read
// More" links, contact labels) has a hard ceiling here. For very tall designs
// we plan to add vertical chunking next - see issue note below.
const LAYOUT_IMAGE_MAX_DIMENSION = 7800;
const LAYOUT_IMAGE_JPEG_QUALITY = 95;
// 4-minute hard cap on the Anthropic call so an unresponsive upstream can't
// keep a job pinned in "Generating" forever.
const ANTHROPIC_REQUEST_TIMEOUT_MS = 4 * 60 * 1000;
// Design-aware generation must cover every field in the extracted schema for
// multi-section pages (hero, services, FAQs, testimonials, locations, etc.).
// 6K tokens was truncating mid-page; bump to 32K so a full design fits.
const DESIGN_AWARE_MIN_OUTPUT_TOKENS = 32000;
const LAYOUT_EXTRACTION_MAX_TOKENS = 12000;
const LAYOUT_EXTRACTION_TEMPERATURE = 0;
// Step 2 of the design-aware pipeline: author every schema field as a verbose
// "Section / - Field: value" block. Temperature 0 keeps the model strictly
// walking the schema rather than improvising a generic page.
const FIELD_MAPPED_AUTHORING_MAX_TOKENS = 24000;
const FIELD_MAPPED_AUTHORING_TEMPERATURE = 0;

const LAYOUT_EXTRACTION_SYSTEM_PROMPT = [
  'You extract dynamic webpage BODY-LAYOUT BLUEPRINT schemas from uploaded design images, Figma screenshots, or webpage screenshots.',
  'You must not generate final website content in this step.',
  'BLUEPRINT-ONLY RULE: The uploaded design is a body-layout blueprint only. Treat ALL text visible inside the design as dummy placeholder text. Never copy, rewrite, paraphrase, or use the design text to infer the final topic, names, locations, services, claims, keywords, or messaging. The visible design text is NOT the content source.',
  'AI Hub / user prompt controls topic and writing rules. The uploaded design controls only body layout, field count, repeated item count, and approximate field length per field.',
  'Use the design only to identify layout structure, every visible content slot, repeated elements, text roles, visual hierarchy, probable section purpose from visual patterns, and approximate character length per field.',
  'Extract at FIELD LEVEL for the page body, not only section level. Every visible page-body content slot must appear as its own field. Do not only extract major sections like Hero, Services, FAQ - for each page-body section, capture every visible content slot separately.',
  'CONCRETE EXAMPLE: if a hero visually contains an eyebrow, H1, paragraph, button, rating line, and 3 contact blocks, all of those must be separate fields in the schema (eyebrow, h1, paragraph, primary_button, rating_text, and a repeated_group of 3 contact blocks with their own fields). Do not collapse this into one heading + one paragraph.',
  'REPEATED BLOCKS RULE: if a section has cards, checklist items, benefits, locations, testimonials, CTAs, stats, FAQs, or any repeated visual blocks, extract the EXACT visible count and every field inside each item.',
  'NEVER collapse multiple visual blocks into one paragraph field. NEVER skip small labels, buttons, links, microcopy, ratings, contact blocks, or section descriptions/subheadings.',
  'FIELD DISCOVERY RULE: for every page-body section, scan visually from top to bottom and left to right. Identify every small label/eyebrow, heading, paragraph, button, link text, rating/review line, contact block, checklist item, card title, card description, card link, stat number, stat label, team name, team role, visible team supporting text, location name, location address, visible location phone/email/contact item, FAQ question, visible FAQ answer, testimonial quote, testimonial author, testimonial role/location, visible testimonial rating, CTA eyebrow, CTA heading, CTA paragraph, CTA button, form label/placeholder, section description/subheading, and visible body microcopy.',
  'Exclude global website chrome from the schema. Do not extract the main header, top navigation, logo area, menu items, global footer, footer links, copyright bar, footer contact columns, footer branding, or global footer columns.',
  'If a visible page-body element repeats, capture the exact visible count. Never collapse repeated cards, FAQ rows, testimonials, stats, contact blocks, checklist items, or location cards into a single summary item.',
  'If a section visually contains separate blocks, columns, cards, feature items, benefit items, checklist rows, grouped text areas, labels, links, buttons, or microcopy, preserve each visible group as its own field or repeated_group item. Do not represent those groups as one or two paragraph fields.',
  'Before returning the schema, validate it against the image. The schema is INCOMPLETE if a body section only has heading/paragraph while visibly containing more fields, an eyebrow/label is missing, a button/link is missing, a repeated group is collapsed into paragraphs, a card link is missing, a checklist item is missing, a rating/review line is missing, contact blocks are missing, a CTA is missing a visible eyebrow/paragraph/button, a location card is missing visible contact fields, a testimonial is missing visible rating/author/role, a team section is missing visible intro text or card fields, or any visible body section is missing. Revise the schema before returning it.',
  'The schema must reflect only the visible uploaded design. Do not hardcode homepage sections, service page sections, fixed section IDs, fixed field names, or any template structure.',
  'Return JSON only. Do not wrap it in markdown. Do not include commentary.',
].join(' ');

const FIELD_MAPPED_AUTHORING_SYSTEM_PROMPT = [
  'You are a STRICT field-mapped content authoring tool.',
  'You receive a JSON body-layout blueprint schema and an AI Hub content brief. You walk the schema SECTION BY SECTION and produce a value for EVERY field in "fields" and EVERY item in "repeated_groups" using the EXACT counts in the schema.',
  'You MUST NOT invent extra sections, fields, or items. You MUST NOT skip or merge any section, field, or item. You MUST NOT collapse repeated groups into a paragraph.',
  'You MUST NOT re-format the output as a webpage, Markdown headings, or paragraphs. Your output is a verbose label-and-value list only.',
  'Treat all design text as dummy placeholder. Use the AI Hub brief for the actual topic, names, locations, services, keyword and tone.',
  'British English. Follow any compliance rules in the AI Hub brief (e.g. UK medical compliance - no diagnosis, no guarantees, no invented credentials/prices, encourage consultation, urgent symptoms => 999/A&E).',
  'Return plain text only. No commentary. No Markdown headings. No code fences.',
].join(' ');

const SEO_RENDERING_SYSTEM_PROMPT = [
  'You convert a complete, pre-authored field-mapped content document into publish-ready, SEO-optimised HTML for a Tiptap WYSIWYG Content field.',
  'You are a PURE RENDERER. You must not drop, skip, summarise, merge, reorder or invent any section, field, or repeated item. Every value in the input must appear exactly once in the output, mapped to the appropriate HTML element using the conversion mapping you are given.',
  'Output MUST be valid HTML using standard semantic tags that Tiptap understands: <h1>, <h2>, <h3>, <p>, <ul>, <ol>, <li>, <blockquote>, <strong>, <em>, <a>, <hr>. Do NOT use Markdown syntax (no #, ##, **, -, >). Do NOT include <html>, <head>, <body>, <doctype>, <style>, <script>, <div>, <span>, or any class/id attributes.',
  'The first element of your output MUST be the H1. Do NOT emit a Title tag, a meta description tag, an SEO meta block, or any title/summary preamble - the modal\'s Title and Meta Description fields are filled by separate generators.',
  'Place the AI Hub primary keyword naturally inside: the H1, the first <p> body paragraph, at least one H2, and the main CTA. Use semantic variations elsewhere. Never keyword-stuff.',
  'British English. Preserve compliance and tone from the input. If the input ends with a disclaimer, include it as the final element wrapped as <p><em>...</em></p>.',
  'Return clean HTML only. No code fence, no commentary, no preamble, no markdown.',
].join(' ');

const SUPPORTED_LAYOUT_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

function inferMimeTypeFromExtension(extension) {
  switch (extension.toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    default:
      return null;
  }
}

async function compressLayoutBuffer(rawBuffer) {
  // Resize to <=LAYOUT_IMAGE_MAX_DIMENSION on the long edge and recompress as
  // JPEG. Keeps payload small (~hundreds of KB instead of MBs) so Anthropic
  // can ingest it fast.
  const optimized = await sharp(rawBuffer)
    .rotate()
    .resize({
      width: LAYOUT_IMAGE_MAX_DIMENSION,
      height: LAYOUT_IMAGE_MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: LAYOUT_IMAGE_JPEG_QUALITY })
    .toBuffer();

  return {
    buffer: optimized,
    mimeType: 'image/jpeg',
  };
}

async function loadLayoutImageBlock(layoutImageUrl) {
  const trimmed = String(layoutImageUrl || '').trim();

  if (!trimmed) {
    return null;
  }

  let rawBuffer = null;

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const response = await fetch(trimmed);

      if (!response.ok) {
        return null;
      }

      rawBuffer = Buffer.from(await response.arrayBuffer());
    } else {
      const normalizedPath = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
      const absolutePath = path.resolve(process.cwd(), 'public', normalizedPath);
      const publicRoot = path.resolve(process.cwd(), 'public');

      if (!absolutePath.startsWith(publicRoot + path.sep)) {
        return null;
      }

      rawBuffer = await fs.readFile(absolutePath);
    }
  } catch {
    return null;
  }

  if (!rawBuffer || rawBuffer.length === 0) {
    return null;
  }

  try {
    const { buffer, mimeType } = await compressLayoutBuffer(rawBuffer);

    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: mimeType,
        data: buffer.toString('base64'),
      },
    };
  } catch {
    // If sharp can't decode the buffer, fall back to the original bytes only
    // when they are small enough for inline use.
    if (rawBuffer.length > 4 * 1024 * 1024) {
      return null;
    }

    const fallbackMime =
      inferMimeTypeFromExtension(path.extname(trimmed)) || 'image/jpeg';

    if (!SUPPORTED_LAYOUT_MIME_TYPES.has(fallbackMime)) {
      return null;
    }

    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: fallbackMime,
        data: rawBuffer.toString('base64'),
      },
    };
  }
}

const DEFAULT_MEDICAL_WEBSITE_SYSTEM_PROMPT = [
  'You generate draft website content for medical and healthcare businesses.',
  'The content is for clinician review before publication.',
  'Write patient-friendly, accurate, non-alarmist content.',
  'Do not diagnose, prescribe, guarantee outcomes, or replace professional medical advice.',
  'Encourage readers to consult the clinic or their clinician for personal advice.',
  'For urgent or emergency symptoms, tell readers to seek urgent medical care.',
  'Avoid unsupported claims and avoid inventing credentials, prices, statistics, citations, or treatments.',
].join(' ');

function requireString(value, fieldName) {
  const normalized = String(value || '').trim();

  if (!normalized) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} is required.`);
  }

  return normalized;
}

function optionalString(value) {
  if (value === undefined || value === null) return undefined;

  const normalized = String(value).trim();

  return normalized || undefined;
}

function readPositiveInteger(value, fallback) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readTemperature(value, fallback) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, parsed));
}

function resolveAnthropicConfig(env) {
  const config = env?.integrations?.anthropic || {};
  const apiKey = optionalString(config.apiKey);

  if (!apiKey) {
    throw new AppError(500, 'INTEGRATION_CONFIG_ERROR', 'ANTHROPIC_API_KEY is required.');
  }

  return {
    apiKey,
    baseUrl: optionalString(config.baseUrl) || 'https://api.anthropic.com',
    maxOutputTokens: readPositiveInteger(config.maxOutputTokens, 4096),
    model: optionalString(config.model) || 'claude-sonnet-4-20250514',
  };
}

function buildMedicalWebsiteUserPrompt({
  audience,
  businessName,
  contentLength,
  contentType,
  extraInstructions,
  keyword,
  prompt,
  topic,
}) {
  const sections = [
    `Primary request:\n${requireString(prompt, 'prompt')}`,
  ];
  const context = [
    ['Business name', businessName],
    ['Keyword', keyword],
    ['Topic', topic],
    ['Content type', contentType],
    ['Content length', contentLength],
    ['Audience', audience],
  ]
    .map(([label, value]) => {
      const normalized = optionalString(value);

      return normalized ? `${label}: ${normalized}` : null;
    })
    .filter(Boolean);

  if (context.length) {
    sections.push(`Context:\n${context.join('\n')}`);
  }

  const normalizedInstructions = optionalString(extraInstructions);

  if (normalizedInstructions) {
    sections.push(`Additional instructions:\n${normalizedInstructions}`);
  }

  return sections.join('\n\n');
}

function buildLayoutExtractionPrompt({
  contentType,
  keyword,
  prompt,
  topic,
}) {
  return [
    'STEP 1 OF 3: BODY-LAYOUT BLUEPRINT EXTRACTION',
    'Analyse the uploaded design image and extract a FIELD-LEVEL body-layout blueprint schema only.',
    'Do not generate final website content.',
    'BLUEPRINT-ONLY: The uploaded design is a body-layout blueprint. Treat all visible design text as dummy placeholder text. Do not use any visible design text as the content source, topic, names, services, locations, or messaging.',
    'AI Hub / user prompt controls topic and writing rules. The uploaded design controls only body layout, field count, repeated item count, and approximate field length per field.',
    'The schema must be dynamic and based only on what is visible in this uploaded design.',
    'Use page_type from AI Hub/user input, not from dummy design text.',
    'CRITICAL: capture EVERY visible page-body text field and content slot inside each body section. Do NOT only extract major sections like Hero, Services, FAQ - for each page-body section, extract every visible content slot as its own separate field.',
    'CONCRETE EXAMPLE: if the hero visually has an eyebrow, H1, paragraph, button, rating line, and 3 contact blocks, your schema must contain all of those as separate fields - an eyebrow field, an h1 field, a paragraph field, a primary_button field, a rating_text field, and a repeated_group of 3 contact blocks each with their own fields. Do NOT collapse this into one heading + one paragraph.',
    'REPEATED BLOCKS: if a section has cards, checklist items, benefits, locations, testimonials, CTAs, stats, FAQs, or repeated visual blocks, extract the EXACT visible count and every field inside each item.',
    'NEVER collapse multiple visual blocks into one paragraph. NEVER skip small labels, buttons, links, microcopy, ratings, contact blocks, or section descriptions/subheadings.',
    'FIELD DISCOVERY RULE: for each page-body section, scan visually from top to bottom and left to right. Extract every visible text placeholder/area separately, including small labels/eyebrows, headings, section descriptions/subheadings, every paragraph, every button, every link, ratings/reviews, contact blocks, checklist items, card titles, card descriptions, card links, stat numbers/labels, team names/roles/supporting text, location names/addresses/phone/email/contact items, FAQ questions/visible answers, testimonial quotes/authors/roles/ratings, CTA eyebrow/heading/paragraph/button, form labels/placeholders, and body microcopy.',
    'Ignore global website chrome completely. Do not extract the main header, top navigation, logo area, menu items, global footer, footer links, copyright bar, footer contact columns, footer branding, or global footer columns.',
    'Do not skip small or secondary page-body fields. Include ratings, review text, contact blocks inside the page body, checklist items, card links, CTA strips, testimonials, location contact details, team card roles, form labels, form placeholders, and support microcopy when visible inside the page body.',
    'For repeated visual elements inside the page body, extract the exact visible count and the fields per item. If there are 4 cards, return 4 cards. If there are 6 FAQ rows, return 6 FAQ items. If there are 3 hero contact blocks, return 3 contact blocks. If there are 4 location cards, return 4 location cards.',
    'COUNT FIDELITY: count visible repeated items by eye, do NOT round up or invent extras. If you see 5 FAQ rows, the count is 5, not 6. If you see 4 location cards, the count is 4, not 5.',
    'EACH VISIBLE CTA BAND IS ITS OWN SECTION: if the design shows two distinct CTA bands (e.g. an inline "Video Consultation" CTA with a phone mockup mid-page AND a final "Ready to Book" booking CTA at the bottom), extract them as TWO separate sections - do not merge multiple distinct CTA bands into one.',
    'If a section has separate visual blocks, columns, feature items, benefit items, checklist rows, grouped text areas, links, buttons, or small labels, extract each as a separate field or repeated_group item. Do not simplify them into generic paragraph fields.',
    'Never collapse repeated visual elements into one summary paragraph.',
    '',
    'SECTION-TYPE FIELD CHECKLISTS - when a section visibly matches one of these patterns, you MUST include every listed field as a separate "fields" entry or "repeated_groups" entry if it is visible in the design:',
    '- HERO (top, large headline + primary CTA): eyebrow (small label above H1), h1, short_paragraph, primary_button. Plus, if visible: rating_label + rating_score + review_count_text (star/score row); contact_blocks repeated_group (each item with contact_label + contact_value, e.g. phone / hours / email).',
    '- ABOUT / OVERVIEW (intro image + heading + body): eyebrow ("About Us" type label), h2, long_paragraph, secondary_button (e.g. "Learn More"). Plus, if visible: checklist_items repeated_group with each row as a single checklist_label, OR a different repeated group depending on the visible content.',
    '- SERVICES / TREATMENTS (grid of cards): eyebrow, h2, intro short_paragraph, view-all primary_button. Plus a cards repeated_group with EACH item containing card_title + card_description + card_link (e.g. "Read More"). If the card visibly shows a link, the link MUST be in fields_per_item.',
    '- STATS / TRUST (full-width counter strip): a stats repeated_group with EACH item containing stat_number + stat_label. No section heading is required if none is visible.',
    '- BENEFITS / WHY CHOOSE (grid of titled paragraphs): eyebrow, h2. Plus a repeated_group with group_role "cards" (or similar) where EACH item contains benefit_title + benefit_description. Do NOT extract a benefits grid as a flat checklist of single-line items unless each block is visibly a single line; if each block has a title + description below it, those are SEPARATE fields_per_item.',
    '- LOCATIONS (grid of location cards): eyebrow, h2, intro short_paragraph. Plus a locations repeated_group with EACH item containing location_name + location_address + location_phone + location_email (whichever are visible per card). If phone/email icons or text are visible on each card, the phone/email fields MUST be in fields_per_item.',
    '- INLINE / VIDEO CONSULTATION CTA (mid-page CTA band with imagery): cta_eyebrow, cta_heading, cta_paragraph, cta_button. Extract as its own section.',
    '- TEAM / DOCTORS (grid of profile cards): eyebrow, h2, intro short_paragraph. Plus a team_profiles repeated_group with EACH item containing team_name + team_role.',
    '- FAQ (vertical accordion list): eyebrow, h2. Plus a faq_items repeated_group with EACH item containing faq_question + faq_answer. Count visible accordion rows exactly.',
    '- TESTIMONIALS (carousel or grid of quotes): eyebrow, h2, intro short_paragraph. Plus a testimonials repeated_group with EACH item containing testimonial_quote + testimonial_author + testimonial_role_location. Per-testimonial rating only if a star row is clearly inside each individual testimonial card (not when there is a single page-level rating row in the hero).',
    '- BOOKING / FINAL CTA (bottom CTA band): cta_heading, cta_paragraph (if visible), cta_button. Extract as its own section even if a mid-page CTA already exists.',
    'A section that visibly contains more fields than this checklist still receives all those extra fields. The checklists are a MINIMUM, not a maximum.',
    '',
    'AI Hub / user input context for resolving ambiguous section purpose:',
    `Page type: ${optionalString(contentType) || 'Not specified'}`,
    `Topic: ${optionalString(topic) || 'Not specified'}`,
    `SEO keyword: ${optionalString(keyword) || 'Not specified'}`,
    '',
    'Resolved AI Hub/user prompt for topic and writing-rule context only:',
    requireString(prompt, 'prompt'),
    '',
    'Return JSON only with this top-level shape. The exact sections, field IDs, field roles, and repeated groups must be generated dynamically from this uploaded design:',
    '{',
    '  "page_type": "from AIHub/user input",',
    '  "sections": [',
    '    {',
    '      "section_id": "dynamic visible-order id, not hardcoded",',
    '      "order": 1,',
    '      "section_type": "dynamic visible structure type, not hardcoded",',
    '      "probable_section_role": "hero | intro | about/overview | services/treatments | conditions | benefits/why choose | process/journey/steps | team/doctors | testimonials | FAQ | CTA | locations | contact/form | stats/trust | blog/resources | accreditations/logos | pricing/plans | tabs/content switcher | table/comparison | gallery | unknown/general content section",',
    '      "confidence": "high | medium | low",',
    '      "visual_reason": "visual pattern only, not design wording",',
    '      "counts": {',
    '        "headings": 0, "paragraphs": 0, "buttons": 0, "cards": 0, "repeated_items": 0, "faqs": 0, "testimonials": 0, "team_profile_cards": 0, "location_cards": 0, "stats_counters": 0, "cta_blocks": 0, "form_fields": 0, "blog_resource_cards": 0, "pricing_cards": 0, "tabs": 0, "accordions": 0, "tables": 0, "gallery_image_blocks": 0',
    '      },',
    '      "fields": [',
    '        { "field_id": "dynamic field id, not hardcoded", "field_role": "text role", "field_type": "text | link_label | button_label | phone | email | address | number | form_label | form_placeholder", "max_chars": 80, "required": true, "notes": "optional visual notes" }',
    '      ],',
    '      "repeated_groups": [',
    '        {',
    '          "group_id": "dynamic group id, not hardcoded",',
    '          "group_role": "cards | faq_items | testimonials | stats | contact_blocks | checklist_items | locations | team_profiles | form_fields | pricing_cards | blog_cards | tabs | accordions | table_rows | gallery_items | other_visible_repeated_group",',
    '          "count": 0,',
    '          "fields_per_item": [',
    '            { "field_role": "text role", "field_type": "text | link_label | button_label | phone | email | address | number | form_label | form_placeholder", "max_chars": 80, "required": true, "notes": "optional visual notes" }',
    '          ]',
    '        }',
    '      ]',
    '    }',
    '  ]',
    '}',
    '',
    'Use page-body field roles such as eyebrow, h1, h2, h3, short_paragraph, long_paragraph, primary_button, secondary_button, rating_label, rating_score, review_count_text, contact_label, contact_value, phone_label, phone_number_placeholder, email_label, email_placeholder, address_label, address_placeholder, opening_hours_text, checklist_title, checklist_description, checklist_label, card_title, card_description, card_link, stat_number, stat_label, team_name, team_role, location_name, location_address, location_phone, location_email, faq_question, faq_answer, testimonial_quote, testimonial_author, testimonial_role_location, blog_title, blog_excerpt, cta_eyebrow, cta_heading, cta_paragraph, cta_button, form_label, form_placeholder, qr_support_label, tab_label, table_heading, table_cell, gallery_caption, or another dynamic role for visible page-body microcopy.',
    'If a visible layout element repeats, preserve the exact visible count and describe the repeated item fields.',
    'If section purpose is unclear, use "unknown/general content section" and preserve the structure.',
    'Completeness requirement for extraction: every visible content slot must appear either in "fields" or in a "repeated_groups" item. Do not return a section with only a high-level summary when individual fields are visible.',
    'Schema validation before returning: a schema is incomplete if a section only has heading and paragraph but visually contains more fields; a visible eyebrow/small label is missing; a visible button/link is missing; a repeated group is collapsed into paragraphs; a visible card link, checklist item, rating/review line, contact block, CTA supporting field, location contact field, testimonial rating/author/role, team intro/card field, or entire body section is missing. If incomplete, revise the schema before returning JSON.',
  ].join('\n');
}

function buildFieldMappedAuthoringPrompt({ layoutSchema, resolvedPrompt }) {
  return [
    'TASK: AUTHOR FIELD-MAPPED CONTENT (STEP 2 OF 3)',
    '',
    'You will walk the extracted JSON layout schema section by section and produce content for EVERY field and EVERY repeated item using the EXACT counts in the schema.',
    'You are NOT generating a webpage. You are NOT writing Markdown headings or paragraphs. You are producing a verbose label-and-value list that a downstream renderer will convert to Markdown.',
    '',
    'OUTPUT FORMAT (plain text only):',
    'For each section in schema order, output a blank line then:',
    '',
    'Section: [human-readable section name based on probable_section_role, e.g. Hero, About, Treatments, Stats, Why Choose Us, Locations, Video Consultation CTA, Team, FAQ, Testimonials, Booking CTA]',
    '',
    'Then, IN SCHEMA ORDER, output one line per field in "fields" and per repeated item in "repeated_groups":',
    '- [Human Field Label]: [generated value]',
    '',
    'Field-label conventions (use these labels when the schema field_role matches; otherwise derive a clear label from field_role):',
    '- field_role "eyebrow" => "Eyebrow"',
    '- field_role "h1" => "H1"',
    '- field_role "h2" => "H2"',
    '- field_role "h3" => "H3"',
    '- field_role "short_paragraph" / "long_paragraph" / section description => "Paragraph" (or "Intro Paragraph" if it is the section intro)',
    '- field_role "primary_button" / "secondary_button" / "cta_button" / "view_all_button" => "Primary Button" / "Secondary Button" / "CTA Button" / "View All Button"',
    '- field_role "link_label" / "card_link" => "Link" or "Card N Link"',
    '- field_role "rating_label" => "Rating Label"; "rating_score" => "Rating Score"; "review_count_text" => "Review Count"',
    '- field_role "checklist_label" => "Checklist Item N"',
    '- field_role "card_title" => "Card N Title"; "card_description" => "Card N Description"',
    '- field_role "stat_number" => "Stat N Number"; "stat_label" => "Stat N Label"',
    '- field_role "team_name" => "Team Profile N Name"; "team_role" => "Team Profile N Role"',
    '- field_role "location_name" => "Location N Name"; "location_address" => "Location N Address"; phone => "Location N Phone"; email => "Location N Email"',
    '- field_role "faq_question" => "FAQ N Question"; "faq_answer" => "FAQ N Answer"',
    '- field_role "testimonial_quote" => "Testimonial N Quote"; "testimonial_author" => "Testimonial N Author"; "testimonial_role_location" => "Testimonial N Role/Location"',
    '- field_role "cta_eyebrow" / "cta_heading" / "cta_paragraph" / "cta_button" => "CTA Eyebrow" / "CTA Heading" / "CTA Paragraph" / "CTA Button"',
    '- contact_label / contact_value => "Contact Block N - Label: ... | Value: ..." (one line per contact block)',
    '- benefit title / description => "Benefit N Title" / "Benefit N Description"',
    '- form_label / form_placeholder => "Form Field N Label" / "Form Field N Placeholder"',
    'For any field_role not listed, invent a clear human label that includes the role (e.g. "Section Description", "Microcopy") and an index (N) if it is part of a repeated group.',
    '',
    'STRICT COMPLETENESS RULES:',
    '- Walk EVERY section in schema order. Never skip a section. Never reorder sections. Never merge sections. Never split sections.',
    '- For each section, output EVERY field in "fields" AND every item in "repeated_groups" using the EXACT "count". If a repeated_group has count: 4, output exactly 4 numbered items, each with all of its fields_per_item.',
    '- Never collapse a repeated group into a paragraph. 4 cards => 4 numbered "Card N Title/Description/Link" blocks.',
    '- Never skip eyebrows, buttons, links, ratings, contact blocks, checklist items, card links, location phone/email, stat headings, intro paragraphs, CTA eyebrows/paragraphs/buttons, team intros, or any small field.',
    '- Do NOT invent fields or sections that are not in the schema.',
    '',
    'CONTENT RULES:',
    '- Topic, business name, doctor/consultant names, locations, services, primary keyword and tone come from the AI Hub brief - NOT from any design text and NOT from the model\'s general knowledge of "what a typical page looks like".',
    '- Use semantic variations of the AI Hub primary keyword naturally where appropriate.',
    '- British English. Follow UK medical/regulated compliance: no diagnosis, no guarantees, no invented credentials/prices/statistics. For urgent symptoms, advise contacting 999 or A&E. Encourage consultation with a clinician/GP.',
    '- Keep each value layout-safe - close to (or within) the schema field\'s max_chars where provided. Treat max_chars as a SOFT per-field target, never as a reason to skip a sibling field.',
    '',
    'EXTRACTED LAYOUT SCHEMA (walk this exactly):',
    layoutSchema,
    '',
    'AI HUB / USER CONTENT BRIEF (topic and writing rules):',
    resolvedPrompt,
    '',
    'Return ONLY the field-mapped content as plain text using the "Section: X" headers and "- Field Label: value" lines. No Markdown headings. No commentary. No closing summary.',
  ].join('\n');
}

function buildSEORenderingPrompt({ fieldMappedContent, resolvedPrompt }) {
  return [
    'TASK: RENDER FIELD-MAPPED CONTENT AS SEO-OPTIMISED HTML FOR TIPTAP (STEP 3 OF 3)',
    '',
    'You are a PURE RENDERER. Convert the complete field-mapped content below into publish-ready, SEO-optimised HTML for the Content field of a Tiptap WYSIWYG editor.',
    '',
    'CRITICAL: Every "- [Field Label]: [value]" line in the input MUST appear in the output, converted to the matching HTML element per the conversion mapping below. Do not drop, skip, summarise, merge, reorder, or invent any field. This is conversion only - preserve every value.',
    '',
    'OUTPUT IS HTML (Tiptap-compatible). Use ONLY these tags: <h1>, <h2>, <h3>, <p>, <ul>, <ol>, <li>, <blockquote>, <strong>, <em>, <a>, <hr>. Do NOT use Markdown syntax (no #, ##, **, -, >). Do NOT include <html>, <head>, <body>, <doctype>, <style>, <script>, <div>, <span>, or any class/id attributes.',
    '',
    'CONVERSION MAPPING (input label => HTML element):',
    '- Eyebrow => "<p><strong>Eyebrow Text</strong></p>" placed immediately above the related heading.',
    '- H1 => "<h1>Heading</h1>" used EXACTLY ONCE for the very first section, as the FIRST element of the output.',
    '- H2 / Section Heading => "<h2>Heading</h2>" for each subsequent "Section: X" in input order.',
    '- H3 / Card N Title / Location N Name / Team Profile N Name / FAQ N Question / Benefit N Title => "<h3>Heading</h3>".',
    '- Paragraph / Intro Paragraph / Section Description / CTA Paragraph => "<p>Paragraph text.</p>".',
    '- Primary Button / Secondary Button / CTA Button / View All Button => "<p><strong>[Label]</strong></p>" on its own line.',
    '- Link / Card N Link => "<p><strong>[Label]</strong></p>" beneath the related description.',
    '- Checklist Item N => "<li>item</li>" wrapped in a single "<ul>...</ul>" grouping all consecutive checklist items in the section.',
    '- Card N Description => "<p>...</p>" beneath the matching Card N Title <h3>.',
    '- Stat N Number + Stat N Label => "<li><strong>10,000+</strong> Procedures performed</li>" wrapped in a single "<ul>...</ul>" grouping all stats in the section.',
    '- Team Profile N Role => "<p>Role text</p>" beneath the matching team <h3>.',
    '- Location N Address => "<p>Address text</p>" beneath the matching Location N Name <h3>.',
    '- Location N Phone => "<li><strong>Phone:</strong> 0121 555 0123</li>" inside a per-location "<ul>...</ul>" that groups that location\'s phone and email together, placed beneath the address paragraph.',
    '- Location N Email => "<li><strong>Email:</strong> clinic@example.co.uk</li>" inside the same per-location "<ul>".',
    '- FAQ N Answer => "<p>Answer text</p>" directly beneath the matching FAQ N Question <h3>.',
    '- Testimonial N Quote => "<blockquote><p>Quote text</p></blockquote>".',
    '- Testimonial N Author + Testimonial N Role/Location => place inside the SAME blockquote as a second paragraph: "<blockquote><p>Quote text</p><p>- <strong>Author Name</strong>, Role/Location</p></blockquote>".',
    '- Rating Label + Rating Score + Review Count => one "<p><strong>Patient Rating 4.9</strong> - Based on 230+ reviews</p>".',
    '- Contact Block N (Label + Value) => "<li><strong>Label:</strong> Value</li>" inside a single "<ul>...</ul>" grouping all contact blocks of the section.',
    '- CTA Eyebrow + CTA Heading + CTA Paragraph + CTA Button => "<p><strong>Eyebrow</strong></p>" then "<h2>CTA Heading</h2>" (or "<h3>" for inner CTA bands), then "<p>CTA Paragraph</p>", then "<p><strong>[CTA Button]</strong></p>".',
    '- Form Field N Label + Placeholder => "<p><strong>Label:</strong> [Placeholder]</p>".',
    '',
    'STRUCTURE RULES:',
    '- EXACTLY ONE <h1> (the first section\'s H1) as the FIRST element of the output.',
    '- One <h2> per subsequent "Section: X" in input order. Never reorder, merge, split, or skip sections.',
    '- <h3> for every repeated item in a section (each card, location, team profile, FAQ question, benefit).',
    '- Separate top-level sections with "<hr>" on its own line between them.',
    '- Use lowercase tag names. Self-closing tags as <hr> (no slash needed).',
    '- Group consecutive list items into a single <ul> or <ol>. Never emit a single-item <ul> when the input has multiple sibling items.',
    '- Do NOT emit <title>, <meta>, or any preamble. The modal\'s Title and Meta Description fields are filled by separate generators. The output starts at the <h1>.',
    '',
    'SEO RULES:',
    '- Place the AI Hub primary keyword naturally inside: the <h1>, the first <p> body paragraph, at least one <h2>, and the main / booking CTA. Use semantic / LSI variations elsewhere. Never keyword-stuff.',
    '- Where the AI Hub brief specifies a target location (city, region, country), weave it into the <h1>, at least one <h2>, and the first <p> body paragraph (you may lightly adjust wording for keyword/location placement, but do not change the meaning or add new facts that are not in the input).',
    '- Write descriptive, keyword-aware <h2> and <h3> headings (use the values from the input - do not output generic labels like "Section 1" or "Card 1").',
    '- Keep paragraphs scannable (typically 1-4 sentences).',
    '',
    'COMPLETENESS - NO DROPS:',
    '- Every "Section: X" in the input MUST become exactly one <h1> (first only) or <h2> (subsequent) in the output, in the same order.',
    '- Every "- [Field Label]: [value]" line in the input MUST appear in the output mapped to the correct HTML element.',
    '- Every repeated item in the input MUST appear in the output as its own <h3> / <li> / <blockquote> / <p> per the mapping.',
    '- Do NOT add new sections, fields, items, or facts not present in the input.',
    '',
    'COMPLIANCE:',
    '- Preserve British English, tone and any compliance disclaimer present in the input.',
    '- If the AI Hub brief or input requires a disclaimer, end the output with "<p><em>Disclaimer text...</em></p>".',
    '',
    'FIELD-MAPPED CONTENT TO RENDER (preserve every value):',
    fieldMappedContent,
    '',
    'AI HUB CONTEXT (for keyword/location placement only - do NOT add new content):',
    resolvedPrompt,
    '',
    'PRE-RETURN CHECK (run silently before returning):',
    '- The first element is <h1>. No <title>, <meta>, no preamble, no markdown syntax anywhere.',
    '- Exactly one <h1>. One <h2> per "Section: X" in input order. <h3> for every repeated item.',
    '- Every "- [Field Label]: [value]" line in the input is represented in the output (no drops).',
    '- Only allowed tags are used. No <div>, <span>, class/id attributes, or block-level wrappers.',
    '- Primary keyword is present in the <h1>, the first <p> body paragraph, at least one <h2>, and the main CTA.',
    '- All <ul>/<ol> contain at least one <li>; <blockquote> contains <p>; tags are properly closed.',
    '- Fix any drop, leftover markdown, meta block, or missing keyword placement before returning.',
    '',
    'Return clean HTML only. Do not wrap in a code fence. Do not include any commentary or preamble.',
  ].join('\n');
}

function extractAnthropicText(payload) {
  const content = Array.isArray(payload?.content) ? payload.content : [];

  return content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function buildAnthropicErrorMessage(payload, fallback) {
  return (
    optionalString(payload?.error?.message) ||
    optionalString(payload?.message) ||
    fallback
  );
}

async function callAnthropicMessages({
  apiKey,
  endpoint,
  requestPayload,
}) {
  let response;
  let responsePayload;
  const abortController = new AbortController();
  const timeoutId = setTimeout(
    () => abortController.abort(),
    ANTHROPIC_REQUEST_TIMEOUT_MS,
  );

  try {
    response = await fetch(endpoint, {
      body: JSON.stringify(requestPayload),
      headers: {
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
        'x-api-key': apiKey,
      },
      method: 'POST',
      signal: abortController.signal,
    });
    responsePayload = await response.json().catch(() => null);
  } catch (error) {
    const isTimeout =
      error?.name === 'AbortError' || abortController.signal.aborted;

    throw new AppError(
      isTimeout ? 504 : 502,
      isTimeout ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_API_ERROR',
      isTimeout
        ? `Anthropic request timed out after ${Math.round(ANTHROPIC_REQUEST_TIMEOUT_MS / 1000)}s.`
        : 'Anthropic request failed.',
      {
        cause: error instanceof Error ? error.message : String(error),
        provider: 'ANTHROPIC',
      },
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const text = extractAnthropicText(responsePayload);

  if (!response.ok || !text) {
    throw new AppError(
      502,
      'UPSTREAM_API_ERROR',
      buildAnthropicErrorMessage(responsePayload, 'Anthropic did not return assistant content.'),
      {
        provider: 'ANTHROPIC',
        stopReason: responsePayload?.stop_reason ?? null,
        upstreamStatus: response.status,
      },
    );
  }

  return {
    responsePayload,
    text,
  };
}

async function generateMedicalWebsiteContent({
  audience,
  businessName,
  contentLength,
  contentType,
  env,
  extraInstructions,
  keyword,
  layoutImageUrl,
  maxOutputTokens,
  model,
  prompt,
  systemPrompt,
  temperature,
  topic,
}) {
  const config = resolveAnthropicConfig(env);
  const resolvedPrompt = buildMedicalWebsiteUserPrompt({
    audience,
    businessName,
    contentLength,
    contentType,
    extraInstructions,
    keyword,
    prompt,
    topic,
  });
  const resolvedModel = optionalString(model) || config.model;
  const requestedMaxOutputTokens = readPositiveInteger(maxOutputTokens, config.maxOutputTokens);
  const resolvedTemperature = readTemperature(temperature, 0.4);
  const endpoint = `${config.baseUrl.replace(/\/+$/, '')}/v1/messages`;
  const layoutBlock = await loadLayoutImageBlock(layoutImageUrl);
  const hasLayout = Boolean(layoutBlock);
  const resolvedMaxOutputTokens = hasLayout
    ? Math.max(requestedMaxOutputTokens, DESIGN_AWARE_MIN_OUTPUT_TOKENS)
    : requestedMaxOutputTokens;
  const baseSystem = optionalString(systemPrompt) || DEFAULT_MEDICAL_WEBSITE_SYSTEM_PROMPT;
  let layoutSchema = '';
  let extractionUsage = null;
  let fieldMappedContent = '';
  let fieldMappedUsage = null;

  if (hasLayout) {
    // Step 1 of 3: extract the body-layout blueprint schema from the image.
    const extractionPrompt = buildLayoutExtractionPrompt({
      contentType,
      keyword,
      prompt: resolvedPrompt,
      topic,
    });
    const extractionPayload = {
      max_tokens: LAYOUT_EXTRACTION_MAX_TOKENS,
      messages: [
        {
          content: [layoutBlock, { type: 'text', text: extractionPrompt }],
          role: 'user',
        },
      ],
      model: resolvedModel,
      system: LAYOUT_EXTRACTION_SYSTEM_PROMPT,
      temperature: LAYOUT_EXTRACTION_TEMPERATURE,
    };
    const extractionResult = await callAnthropicMessages({
      apiKey: config.apiKey,
      endpoint,
      requestPayload: extractionPayload,
    });

    layoutSchema = extractionResult.text;
    extractionUsage = extractionResult.responsePayload?.usage ?? null;

    // Step 2 of 3: walk the schema and produce a complete field-mapped content
    // document ("Section: X" + "- Field Label: value" lines). This intermediate
    // guarantees every schema field is filled - the final Markdown renderer is
    // then a pure transformation and cannot drop fields.
    const fieldMappedPrompt = buildFieldMappedAuthoringPrompt({
      layoutSchema,
      resolvedPrompt,
    });
    const fieldMappedPayload = {
      max_tokens: FIELD_MAPPED_AUTHORING_MAX_TOKENS,
      messages: [
        {
          content: fieldMappedPrompt,
          role: 'user',
        },
      ],
      model: resolvedModel,
      system: FIELD_MAPPED_AUTHORING_SYSTEM_PROMPT,
      temperature: FIELD_MAPPED_AUTHORING_TEMPERATURE,
    };
    const fieldMappedResult = await callAnthropicMessages({
      apiKey: config.apiKey,
      endpoint,
      requestPayload: fieldMappedPayload,
    });

    fieldMappedContent = fieldMappedResult.text;
    fieldMappedUsage = fieldMappedResult.responsePayload?.usage ?? null;
  }

  // Step 3 of 3 (or sole step when no layout image): render the final
  // SEO-optimised Markdown. With a layout image this is a pure transformation
  // of the field-mapped content into Markdown headings/paragraphs/lists.
  // Without a layout image, the existing AI Hub prompt drives generation
  // directly.
  const finalPrompt = hasLayout
    ? buildSEORenderingPrompt({
        fieldMappedContent,
        resolvedPrompt,
      })
    : resolvedPrompt;
  const resolvedSystem = hasLayout ? SEO_RENDERING_SYSTEM_PROMPT : baseSystem;
  const requestPayload = {
    max_tokens: resolvedMaxOutputTokens,
    messages: [
      {
        content: finalPrompt,
        role: 'user',
      },
    ],
    model: resolvedModel,
    system: resolvedSystem,
    temperature: resolvedTemperature,
  };
  const { responsePayload, text } = await callAnthropicMessages({
    apiKey: config.apiKey,
    endpoint,
    requestPayload,
  });
  const finalUsage = responsePayload?.usage ?? {};

  const inputTokens =
    typeof finalUsage.input_tokens === 'number' ||
    typeof extractionUsage?.input_tokens === 'number' ||
    typeof fieldMappedUsage?.input_tokens === 'number'
      ? (finalUsage.input_tokens || 0) +
        (extractionUsage?.input_tokens || 0) +
        (fieldMappedUsage?.input_tokens || 0)
      : null;
  const outputTokens =
    typeof finalUsage.output_tokens === 'number' ||
    typeof extractionUsage?.output_tokens === 'number' ||
    typeof fieldMappedUsage?.output_tokens === 'number'
      ? (finalUsage.output_tokens || 0) +
        (extractionUsage?.output_tokens || 0) +
        (fieldMappedUsage?.output_tokens || 0)
      : null;

  return {
    model: resolvedModel,
    provider: 'ANTHROPIC',
    stopReason: responsePayload?.stop_reason ?? null,
    text,
    usage: {
      inputTokens,
      outputTokens,
    },
  };
}

module.exports = {
  DEFAULT_MEDICAL_WEBSITE_SYSTEM_PROMPT,
  generateMedicalWebsiteContent,
};
