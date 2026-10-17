// Builds a clean, ATS-friendly A4 resume PDF with jsPDF (no extra packages).
//
//   downloadResumePdf(resumeText, "Rahul-Sharma-Resume.pdf")
//   buildResumePdf(model) -> jsPDF document
//
// Layout: centred name + contact line, section headings with a rule under them,
// bold entry titles with dates on the right, bullets with a hanging indent,
// automatic page breaks (headings never sit alone at the bottom of a page), and
// if the resume is only a little too long it is scaled down to fit one page.

import { jsPDF } from "jspdf";
import { parseResume, resumeFileName } from "./resumeFormat.js";

const PAGE_W = 595.28; // A4 in points
const PAGE_H = 841.89;
const MARGIN_X = 46;
const MARGIN_TOP = 42;
const MARGIN_BOTTOM = 40;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

const INK = [24, 24, 27];
const SOFT = [82, 82, 91];
const RULE = [120, 120, 130];

const FONT = "helvetica";
const LINE = 1.36; // line height as a multiple of font size

/* ---------- text the built-in PDF font can show ---------- */

// Characters in the WinAnsi set the standard PDF fonts support beyond Latin-1.
const EXTRA_OK = new Set([
  0x2018, 0x2019, 0x201a, 0x201c, 0x201d, 0x201e, 0x2020, 0x2021, 0x2022, 0x2026, 0x2030, 0x2039, 0x203a,
  0x20ac, 0x2122, 0x2013, 0x2014, 0x02c6, 0x02dc, 0x0160, 0x0161, 0x0178, 0x017d, 0x017e, 0x0152, 0x0153, 0x0192,
]);

export function pdfSafe(text) {
  let out = "";
  const src = String(text || "")
    .replace(/[\u00a0\u2007\u202f\u2009\u200a]/g, " ")
    .replace(/[\u2010\u2011\u2012\u2212]/g, "-")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/\u2192/g, "->")
    .replace(/\u20b9\s*/g, "Rs. ")
    .replace(/[\u25cf\u25aa\u25e6\u25a0\u25ba\u27a2\u00b7\uf0b7\uf0a7]/g, "\u2022");
  for (const ch of src) {
    const code = ch.codePointAt(0);
    if (code < 256 || EXTRA_OK.has(code)) out += ch;
  }
  return out;
}

/* ---------- rendering ---------- */

function render(model, scale) {
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  doc.setProperties({
    title: (model.name ? model.name + " - " : "") + "Resume",
    subject: "Resume",
    creator: "SkillGap AI",
  });

  const size = (n) => n * scale;
  let y = MARGIN_TOP;

  function setFont(style, pt, color) {
    doc.setFont(FONT, style);
    doc.setFontSize(pt);
    doc.setTextColor(color[0], color[1], color[2]);
  }

  function styleOf(run, forceBold) {
    const bold = forceBold || run.bold;
    if (bold && run.italic) return "bolditalic";
    if (bold) return "bold";
    if (run.italic) return "italic";
    return "normal";
  }

  function measure(text, style, pt) {
    doc.setFont(FONT, style);
    doc.setFontSize(pt);
    return doc.getTextWidth(text);
  }

  function newPage() {
    doc.addPage();
    y = MARGIN_TOP;
  }

  function ensure(height) {
    if (y + height > PAGE_H - MARGIN_BOTTOM) newPage();
  }

  // Word-wraps styled runs into lines of segments: [[{ text, style, width }]]
  function wrap(runs, maxWidth, pt, forceBold) {
    const words = [];
    for (let i = 0; i < runs.length; i++) {
      const style = styleOf(runs[i], forceBold);
      const pieces = pdfSafe(runs[i].text).split(/\s+/);
      for (let k = 0; k < pieces.length; k++) {
        if (pieces[k] !== "") words.push({ text: pieces[k], style: style });
      }
    }

    const lines = [];
    let line = [];
    let lineWidth = 0;
    const space = measure(" ", "normal", pt);

    function pushLine() {
      if (!line.length) return;
      // merge neighbouring words of the same style into one segment
      const segments = [];
      for (let i = 0; i < line.length; i++) {
        const w = line[i];
        const last = segments.length ? segments[segments.length - 1] : null;
        if (last && last.style === w.style) last.text += " " + w.text;
        else {
          if (last) last.text += " ";
          segments.push({ text: w.text, style: w.style, width: 0 });
        }
      }
      for (let i = 0; i < segments.length; i++) segments[i].width = measure(segments[i].text, segments[i].style, pt);
      lines.push(segments);
      line = [];
      lineWidth = 0;
    }

    for (let i = 0; i < words.length; i++) {
      let word = words[i];
      let w = measure(word.text, word.style, pt);

      // a single very long word (a URL, say) is broken so it never runs off the page
      while (w > maxWidth && word.text.length > 1) {
        let cut = word.text.length - 1;
        while (cut > 1 && measure(word.text.slice(0, cut), word.style, pt) > maxWidth - lineWidth) cut--;
        if (lineWidth > 0 && cut <= 1) { pushLine(); continue; }
        line.push({ text: word.text.slice(0, cut), style: word.style });
        pushLine();
        word = { text: word.text.slice(cut), style: word.style };
        w = measure(word.text, word.style, pt);
      }

      const needed = lineWidth === 0 ? w : lineWidth + space + w;
      if (lineWidth > 0 && needed > maxWidth) {
        pushLine();
        line.push(word);
        lineWidth = w;
      } else {
        line.push(word);
        lineWidth = needed;
      }
    }
    pushLine();
    return lines;
  }

  function drawLine(segments, x, baseline, pt, color) {
    let cursor = x;
    for (let i = 0; i < segments.length; i++) {
      setFont(segments[i].style, pt, color);
      doc.text(segments[i].text, cursor, baseline);
      cursor += segments[i].width;
    }
  }

  function lineWidthOf(segments) {
    let total = 0;
    for (let i = 0; i < segments.length; i++) total += segments[i].width;
    return total;
  }

  // Draws wrapped runs starting at x. Returns nothing; moves y down.
  function drawParagraph(runs, x, width, pt, color, forceBold) {
    const lines = wrap(runs, width, pt, forceBold);
    const lh = pt * LINE;
    ensure(Math.min(lines.length, 2) * lh);
    for (let i = 0; i < lines.length; i++) {
      if (y + lh > PAGE_H - MARGIN_BOTTOM) newPage();
      drawLine(lines[i], x, y + lh * 0.76, pt, color);
      y += lh;
    }
  }

  /* ----- header ----- */
  if (model.name) {
    let namePt = size(22);
    while (namePt > 13 && measure(pdfSafe(model.name), "bold", namePt) > CONTENT_W) namePt -= 1;
    setFont("bold", namePt, INK);
    doc.text(pdfSafe(model.name), PAGE_W / 2, y + namePt * 0.82, { align: "center" });
    y += namePt * 1.2;
  }

  for (let i = 0; i < model.taglines.length; i++) {
    const pt = size(11);
    const lines = wrap([{ text: model.taglines[i], bold: false, italic: false }], CONTENT_W, pt, false);
    for (let k = 0; k < lines.length; k++) {
      const lh = pt * LINE;
      drawLine(lines[k], MARGIN_X + (CONTENT_W - lineWidthOf(lines[k])) / 2, y + lh * 0.76, pt, SOFT);
      y += lh;
    }
  }

  if (model.contact.length) {
    const pt = size(9.6);
    const sep = "  |  ";
    const sepW = measure(sep, "normal", pt);
    const rows = [];
    let row = [];
    let rowW = 0;
    for (let i = 0; i < model.contact.length; i++) {
      const item = pdfSafe(model.contact[i]);
      const w = measure(item, "normal", pt);
      if (row.length && rowW + sepW + w > CONTENT_W) {
        rows.push(row);
        row = [];
        rowW = 0;
      }
      rowW += (row.length ? sepW : 0) + w;
      row.push(item);
    }
    if (row.length) rows.push(row);

    y += size(2);
    for (let i = 0; i < rows.length; i++) {
      const text = rows[i].join(sep);
      const lh = pt * LINE;
      setFont("normal", pt, SOFT);
      doc.text(text, PAGE_W / 2, y + lh * 0.76, { align: "center" });
      y += lh;
    }
  }

  if (model.name || model.contact.length || model.taglines.length) {
    y += size(5);
    doc.setDrawColor(INK[0], INK[1], INK[2]);
    doc.setLineWidth(1);
    doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y);
    y += size(4);
  }

  /* ----- sections ----- */
  const BODY = size(10.4);
  const LH = BODY * LINE;

  for (let s = 0; s < model.sections.length; s++) {
    const section = model.sections[s];

    if (section.title) {
      const pt = size(10.6);
      y += s === 0 ? size(5) : size(11);
      // keep the heading together with the first lines under it
      ensure(pt * LINE + size(8) + LH * 2);
      setFont("bold", pt, INK);
      doc.text(pdfSafe(section.title).toUpperCase(), MARGIN_X, y + pt * 0.86, { charSpace: 0.9 });
      y += pt * 1.15;
      doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
      doc.setLineWidth(0.6);
      doc.line(MARGIN_X, y + 1.5, PAGE_W - MARGIN_X, y + 1.5);
      y += size(7);
    }

    for (let b = 0; b < section.blocks.length; b++) {
      const block = section.blocks[b];

      if (block.type === "entry") {
        const pt = BODY + size(0.2);
        const datePt = size(9.8);
        const dateW = block.date ? measure(pdfSafe(block.date), "italic", datePt) : 0;
        const leftW = block.date ? CONTENT_W - dateW - 14 : CONTENT_W;
        const lines = wrap([{ text: block.text, bold: true, italic: false }], leftW, pt, true);
        const lh = pt * LINE;

        y += b === 0 ? size(1) : size(5.5);
        ensure(lines.length * lh + LH); // title + at least one line below it
        for (let i = 0; i < lines.length; i++) {
          drawLine(lines[i], MARGIN_X, y + lh * 0.76, pt, INK);
          if (i === 0 && block.date) {
            setFont("italic", datePt, SOFT);
            doc.text(pdfSafe(block.date), PAGE_W - MARGIN_X, y + lh * 0.76, { align: "right" });
          }
          y += lh;
        }
      } else if (block.type === "bullet") {
        const indent = 15;
        const lines = wrap(block.runs, CONTENT_W - indent - 4, BODY, false);
        ensure(Math.min(lines.length, 2) * LH);
        y += size(1.2);
        for (let i = 0; i < lines.length; i++) {
          if (y + LH > PAGE_H - MARGIN_BOTTOM) newPage();
          if (i === 0) {
            doc.setFillColor(INK[0], INK[1], INK[2]);
            doc.circle(MARGIN_X + 6, y + LH * 0.76 - BODY * 0.29, 1.6 * scale, "F");
          }
          drawLine(lines[i], MARGIN_X + indent, y + LH * 0.76, BODY, INK);
          y += LH;
        }
      } else if (block.type === "kv") {
        y += size(1.5);
        drawParagraph(
          [{ text: block.label + " ", bold: true, italic: false }, { text: block.text, bold: false, italic: false }],
          MARGIN_X, CONTENT_W, BODY, INK, false
        );
      } else {
        y += size(2);
        drawParagraph(block.runs, MARGIN_X, CONTENT_W, BODY, INK, false);
      }
    }
  }

  return { doc: doc, pages: doc.getNumberOfPages() };
}

export function buildResumePdf(model) {
  const first = render(model, 1);
  if (first.pages === 1) return first.doc;

  // slightly too long? shrink a little so it fits on one page
  const shrink = [0.96, 0.92, 0.88];
  for (let i = 0; i < shrink.length; i++) {
    const attempt = render(model, shrink[i]);
    if (attempt.pages === 1) return attempt.doc;
  }
  return first.doc; // genuinely longer than one page: keep normal size, multiple pages
}

export function downloadResumePdf(resumeText, fileName) {
  const model = parseResume(resumeText);
  const doc = buildResumePdf(model);
  doc.save(fileName || resumeFileName(model, "pdf"));
}