// Turns resume text (plain text OR the markdown-style text the AI returns) into a
// structured resume that the PDF, Word and on-screen preview all share.
//
//   parseResume(text) -> {
//     name: "Rahul Sharma",
//     taglines: ["Aspiring Software Developer"],
//     contact: ["rahul@example.com", "+91 98765 43210", "Bengaluru"],
//     sections: [{ title: "Experience", blocks: [ ...blocks ] }]
//   }
//   block types:
//     { type: "entry",  text, date }        bold title line, date aligned right
//     { type: "bullet", runs }              bullet point
//     { type: "kv",     label, text }       "Languages: Python, Java"
//     { type: "para",   runs }              normal paragraph
//   runs: [{ text, bold, italic }]
//
//   plainForDiff(text) -> the same text without markdown symbols, so the
//   original-vs-rewritten comparison does not light up "#" and "**".

/* ---------- small helpers ---------- */

const BULLET_CHARS = "\\-*\\u2022\\u25CF\\u25AA\\u25E6\\u25A0\\u25BA\\u27A2\\u00B7\\uF0B7\\uF0A7\\u2013\\u2014";
const BULLET_RE = new RegExp("^\\s*[" + BULLET_CHARS + "]\\s+(\\S.*)$");
const MD_HEADING_RE = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE_RE = /^\s*([-_*=~])\1{2,}\s*$/;
const CONTACT_LABEL_RE = /^(e-?mail|phone|mobile|mob|contact|tel|location|address|linkedin|github|portfolio|website|web|url)\s*[:\-\u2013]\s*/i;

const MONTH = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?";
const YEAR = "(?:19|20)\\d{2}";
const POINT = "(?:" + MONTH + "\\s+)?" + YEAR;
const END = "(?:" + POINT + "|Present|Current|Ongoing|Now|Till\\s+date)";
const RANGE = POINT + "\\s*(?:-|\\u2013|\\u2014|to)\\s*" + END;
const DATE_AT_END_RE = new RegExp(
  "^(.*?)[\\s,|(\\[\\u2013\\u2014-]+\\(?\\s*(" +
    RANGE + "|(?:Expected\\s+|Graduating\\s+)?" + MONTH + "\\s+" + YEAR + "|(?:Expected\\s+|Graduating\\s+)?" + YEAR +
    ")\\s*\\)?\\s*$",
  "i"
);

const HEADING_WORDS = new Set([
  "summary", "profile", "objective", "experience", "education", "skills", "projects", "certifications",
  "certification", "certificates", "achievements", "awards", "activities", "interests", "hobbies",
  "languages", "references", "declaration", "details", "information", "history", "competencies",
  "training", "courses", "publications", "research", "internships", "internship", "background",
  "volunteering", "volunteer", "leadership", "academics", "accomplishments", "honors", "about",
  "contact", "responsibilities", "tools", "technologies", "project", "skill", "award", "achievement",
  "interest", "language", "reference", "activity",
]);
const FILLER_WORDS = new Set([
  "and", "of", "professional", "technical", "work", "key", "academic", "personal", "relevant", "career",
  "additional", "other", "extra", "curricular", "extracurricular", "core", "me", "employment", "soft",
  "hard", "areas", "interest", "&", "/",
]);

export function stripMarkers(text) {
  return String(text || "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*\*|\*\*|__)/g, "")
    .replace(/(^|\s)\*([^*\s][^*]*?)\*(?=\s|$|[.,;:])/g, "$1$2")
    .trim();
}

// "**Bold** and *italic*" -> [{ text, bold, italic }]
export function parseInline(raw) {
  const text = String(raw || "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(^|\s)\*([^*\s][^*]*?)\*(?=\s|$|[.,;:])/g, "$1\uE000$2\uE001"); // *italic* -> marker
  const parts = text.split(/(\*\*\*[^*\n]+?\*\*\*|\*\*[^*\n]+?\*\*|__[^_\n]+?__|\uE000[^\uE001\n]+\uE001)/g);
  const runs = [];
  for (let i = 0; i < parts.length; i++) {
    let part = parts[i];
    if (!part) continue;
    let bold = false;
    let italic = false;
    if (i % 2 === 1) {
      if (part.startsWith("***")) { bold = true; italic = true; part = part.slice(3, -3); }
      else if (part.startsWith("**") || part.startsWith("__")) { bold = true; part = part.slice(2, -2); }
      else { italic = true; part = part.slice(1, -1); } // \uE000...\uE001 marker
    } else {
      part = part.replace(/\*\*|__/g, "");
    }
    if (part) runs.push({ text: part, bold: bold, italic: italic });
  }
  return runs;
}

function runsToText(runs) {
  let out = "";
  for (let i = 0; i < runs.length; i++) out += runs[i].text;
  return out;
}

function wordCount(text) {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

// returns "vocab" (a known section name), "caps" (short ALL CAPS line) or "" (not a heading)
function headingKind(plain) {
  const t = plain.replace(/[:\s]+$/, "").trim();
  if (!t || t.length > 40 || /[.!?,;]$/.test(t) || /\d/.test(t)) return "";
  const words = t.toLowerCase().split(/\s+/);
  if (words.length > 4) return "";

  let hasHeadingWord = false;
  let allKnown = true;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (HEADING_WORDS.has(w)) hasHeadingWord = true;
    else if (!FILLER_WORDS.has(w)) allKnown = false;
  }
  if (hasHeadingWord && allKnown) return "vocab";

  // ALL CAPS short line, e.g. "WORK HISTORY"
  const letters = t.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 4 && t === t.toUpperCase() && t.length <= 32 && !t.includes("@")) return "caps";
  return "";
}

function cleanHeadingTitle(text) {
  return stripMarkers(text).replace(/[:\s]+$/, "").replace(/^[\s\-\u2013\u2014]+|[\s\-\u2013\u2014]+$/g, "");
}

function splitDate(plain) {
  if (plain.length > 130) return null;
  const m = DATE_AT_END_RE.exec(plain);
  if (!m) return null;
  const left = m[1].replace(/[\s,|\u2013\u2014-]+$/, "").trim();
  if (left.length < 2) return null;
  return { left: left, date: m[2].replace(/\s*(-|\u2014|to)\s*/i, " \u2013 ").replace(/\s+/g, " ").trim() };
}

const KV_RE = /^([A-Za-z][A-Za-z0-9 &/+#.'\u2019-]{1,30}?):\s+(\S.*)$/;

function splitKeyValue(plain) {
  const m = KV_RE.exec(plain);
  if (!m) return null;
  const label = m[1].trim();
  if (label.split(/\s+/).length > 4 || /^https?$/i.test(label)) return null;
  return { label: label + ":", text: m[2].trim() };
}

/* ---------- line classification ---------- */

function classify(raw) {
  if (raw.trim() === "" || RULE_RE.test(raw)) return { kind: "blank" };

  const indent = (raw.match(/^\s*/) || [""])[0].length;
  const md = MD_HEADING_RE.exec(raw);
  if (md) {
    const plain = stripMarkers(md[2]);
    return md[1].length <= 2
      ? { kind: "heading", text: cleanHeadingTitle(md[2]), level: md[1].length, plain: plain }
      : { kind: "subheading", text: md[2].trim(), plain: plain };
  }

  const bullet = BULLET_RE.exec(raw);
  if (bullet && !/^\s*\*\*/.test(raw)) {
    return { kind: "bullet", text: bullet[1].trim(), indent: indent };
  }

  const text = raw.trim();
  const plain = stripMarkers(text);
  const via = headingKind(plain);
  if (via) return { kind: "heading", text: cleanHeadingTitle(text), level: 2, plain: plain, via: via };

  return { kind: "text", text: text, plain: plain, indent: indent, boldLine: /^(\*\*|__)/.test(text) };
}

function isContactLine(plain) {
  return (
    /@/.test(plain) ||
    /(https?:\/\/|www\.|linkedin\.|github\.)/i.test(plain) ||
    (plain.match(/\d/g) || []).length >= 8 ||
    CONTACT_LABEL_RE.test(plain)
  );
}

/* ---------- main parser ---------- */

export function parseResume(input) {
  const lines = String(input || "").replace(/\r\n?/g, "\n").replace(/\t/g, "  ").split("\n");
  const items = [];
  for (let i = 0; i < lines.length; i++) items.push(classify(lines[i]));

  const model = { name: "", taglines: [], contact: [], sections: [] };
  let pos = 0;
  while (pos < items.length && items[pos].kind === "blank") pos++;

  // ---- name ----
  if (pos < items.length) {
    const first = items[pos];
    const plain = first.plain || "";
    const nameKind =
      first.kind === "text" ||
      (first.kind === "heading" && first.level === 1) ||
      (first.kind === "heading" && first.via === "caps"); // "RAHUL SHARMA"
    const looksLikeName = nameKind && plain.length > 0 && plain.length <= 60 && !/@/.test(plain) && (plain.match(/\d/g) || []).length < 5;
    if (looksLikeName) {
      model.name = plain.replace(/[:\s]+$/, "");
      pos++;
    }
  }

  // ---- header block (tagline + contact) ----
  let headerLines = 0;
  while (pos < items.length) {
    const it = items[pos];
    if (it.kind === "blank") { pos++; continue; }
    const isTextLike = it.kind === "text" || (it.kind === "heading" && it.via === "caps");
    if (!isTextLike || it.plain.length > 100 || headerLines >= 8) break;
    headerLines++;

    if (isContactLine(it.plain)) {
      const pieces = it.plain.split(/\s*[|\u2022\u00B7]\s*|\s{3,}/);
      for (let k = 0; k < pieces.length; k++) {
        const piece = pieces[k].replace(CONTACT_LABEL_RE, "").trim();
        if (piece) model.contact.push(piece);
      }
    } else {
      model.taglines.push(it.plain);
    }
    pos++;
  }

  // ---- body ----
  let section = { title: "", blocks: [] };
  const sections = [section];
  let lastWasBlank = false;

  function nextNonBlank(from) {
    for (let k = from + 1; k < items.length; k++) if (items[k].kind !== "blank") return items[k];
    return null;
  }

  for (let i = pos; i < items.length; i++) {
    const it = items[i];

    if (it.kind === "blank") { lastWasBlank = true; continue; }

    if (it.kind === "heading") {
      section = { title: it.text, blocks: [] };
      sections.push(section);
      lastWasBlank = false;
      continue;
    }

    const blocks = section.blocks;
    const prev = blocks.length ? blocks[blocks.length - 1] : null;

    if (it.kind === "bullet") {
      blocks.push({ type: "bullet", runs: parseInline(it.text) });
      lastWasBlank = false;
      continue;
    }

    // text / subheading
    const plain = it.plain;
    const forcedTitle = it.kind === "subheading" || it.boldLine;

    // wrapped continuation of the bullet above
    if (prev && prev.type === "bullet" && !lastWasBlank && it.kind === "text" && (it.indent >= 2 || /^[a-z]/.test(plain))) {
      prev.runs = prev.runs.concat([{ text: " ", bold: false, italic: false }], parseInline(it.text));
      continue;
    }

    const dated = splitDate(plain);
    if (dated && (forcedTitle || wordCount(plain) <= 16)) {
      blocks.push({ type: "entry", text: dated.left, date: dated.date });
      lastWasBlank = false;
      continue;
    }

    const kv = !forcedTitle ? splitKeyValue(plain) : null;
    if (kv) {
      blocks.push({ type: "kv", label: kv.label, text: kv.text });
      lastWasBlank = false;
      continue;
    }

    const next = nextNonBlank(i);
    const nextIsBulletOrDated =
      next && (next.kind === "bullet" || (next.kind === "text" && splitDate(next.plain) !== null));
    const shortTitle = plain.length <= 90 && !/[.!?,;:]$/.test(plain);
    if (shortTitle && (forcedTitle || nextIsBulletOrDated)) {
      blocks.push({ type: "entry", text: plain, date: "" });
      lastWasBlank = false;
      continue;
    }

    // hard-wrapped paragraph lines: join when the sentence clearly continues
    if (prev && prev.type === "para" && !lastWasBlank && /^[a-z]/.test(plain) && !/[.!?:]\s*$/.test(runsToText(prev.runs))) {
      prev.runs = prev.runs.concat([{ text: " ", bold: false, italic: false }], parseInline(it.text));
      continue;
    }

    blocks.push({ type: "para", runs: parseInline(it.text) });
    lastWasBlank = false;
  }

  for (let i = 0; i < sections.length; i++) {
    if (sections[i].title || sections[i].blocks.length) model.sections.push(sections[i]);
  }
  return model;
}

/* ---------- text for the comparison view ---------- */

// Same words, no markdown symbols, and one style of bullet, so the
// original-vs-rewritten highlighting only shows real wording changes.
export function plainForDiff(text) {
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (RULE_RE.test(raw)) continue;
    const md = MD_HEADING_RE.exec(raw);
    if (md) { out.push(runsToText(parseInline(md[2])).trim()); continue; }
    const bullet = BULLET_RE.exec(raw);
    if (bullet && !/^\s*\*\*/.test(raw)) { out.push("\u2022 " + runsToText(parseInline(bullet[1])).trim()); continue; }
    out.push(runsToText(parseInline(raw)).trimEnd());
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/* ---------- download file name ---------- */

export function resumeFileName(model, extension) {
  const base = (model.name || "Resume").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return (base || "Resume") + (model.name ? "-Resume" : "") + "." + extension;
}