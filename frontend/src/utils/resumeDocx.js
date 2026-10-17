// Builds an editable Word (.docx) resume with the same layout as the PDF:
// centred header, ruled section headings, dates on the right, real bullet lists.
//
//   downloadResumeDocx(resumeText, "Rahul-Sharma-Resume.docx")

import {
  AlignmentType,
  BorderStyle,
  Document,
  LevelFormat,
  Packer,
  Paragraph,
  Tab,
  TabStopType,
  TextRun,
} from "docx";
import { parseResume, resumeFileName } from "./resumeFormat.js";

const FONT = "Calibri";
const INK = "18181B";
const SOFT = "52525B";
const RULE = "78788A";
const BODY = 21; // half-points: 10.5 pt
const PAGE_WIDTH = 11906; // A4, in twips
const MARGIN_SIDE = 920;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_SIDE * 2; // where the right-aligned dates end

function textRuns(runs, extra) {
  const out = [];
  for (let i = 0; i < runs.length; i++) {
    out.push(
      new TextRun({
        text: runs[i].text,
        bold: runs[i].bold,
        italics: runs[i].italic,
        font: FONT,
        size: BODY,
        color: INK,
        ...extra,
      })
    );
  }
  return out;
}

export function buildResumeDocx(model) {
  const children = [];

  if (model.name) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
        children: [new TextRun({ text: model.name, bold: true, font: FONT, size: 44, color: INK })],
      })
    );
  }

  for (let i = 0; i < model.taglines.length; i++) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 30 },
        children: [new TextRun({ text: model.taglines[i], font: FONT, size: 22, color: SOFT })],
      })
    );
  }

  const hasHeader = model.name || model.taglines.length || model.contact.length;
  if (model.contact.length) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: INK, space: 6 } },
        children: [new TextRun({ text: model.contact.join("  |  "), font: FONT, size: 19, color: SOFT })],
      })
    );
  } else if (hasHeader && children.length) {
    // no contact line: put the rule under the last header paragraph instead
    children.push(
      new Paragraph({
        spacing: { after: 100 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: INK, space: 1 } },
        children: [],
      })
    );
  }

  for (let s = 0; s < model.sections.length; s++) {
    const section = model.sections[s];

    if (section.title) {
      children.push(
        new Paragraph({
          keepNext: true,
          spacing: { before: s === 0 ? 100 : 220, after: 90 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 2 } },
          children: [
            new TextRun({
              text: section.title.toUpperCase(),
              bold: true,
              font: FONT,
              size: 21,
              color: INK,
              characterSpacing: 18,
            }),
          ],
        })
      );
    }

    for (let b = 0; b < section.blocks.length; b++) {
      const block = section.blocks[b];

      if (block.type === "entry") {
        const runs = [new TextRun({ text: block.text, bold: true, font: FONT, size: BODY, color: INK })];
        if (block.date) {
          runs.push(
            new TextRun({
              children: [new Tab(), block.date],
              italics: true,
              font: FONT,
              size: 20,
              color: SOFT,
            })
          );
        }
        children.push(
          new Paragraph({
            keepNext: true,
            spacing: { before: b === 0 ? 20 : 110, after: 20 },
            tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_WIDTH }],
            children: runs,
          })
        );
      } else if (block.type === "bullet") {
        children.push(
          new Paragraph({
            numbering: { reference: "resume-bullets", level: 0 },
            spacing: { after: 30 },
            children: textRuns(block.runs),
          })
        );
      } else if (block.type === "kv") {
        children.push(
          new Paragraph({
            spacing: { before: 30, after: 30 },
            children: textRuns([
              { text: block.label + " ", bold: true, italic: false },
              { text: block.text, bold: false, italic: false },
            ]),
          })
        );
      } else {
        children.push(new Paragraph({ spacing: { before: 40, after: 40 }, children: textRuns(block.runs) }));
      }
    }
  }

  if (children.length === 0) children.push(new Paragraph({ children: [] }));

  return new Document({
    creator: "SkillGap AI",
    title: (model.name ? model.name + " - " : "") + "Resume",
    styles: { default: { document: { run: { font: FONT, size: BODY } } } },
    numbering: {
      config: [
        {
          reference: "resume-bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "\u2022",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 340, hanging: 220 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH, height: 16838 }, // A4
            margin: { top: 760, bottom: 720, left: MARGIN_SIDE, right: MARGIN_SIDE },
          },
        },
        children: children,
      },
    ],
  });
}

export async function downloadResumeDocx(resumeText, fileName) {
  const model = parseResume(resumeText);
  const blob = await Packer.toBlob(buildResumeDocx(model));
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName || resumeFileName(model, "docx");
  link.click();
  URL.revokeObjectURL(url);
}