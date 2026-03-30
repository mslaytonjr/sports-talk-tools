import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..", "..");
const rawRoot = resolve(projectRoot, "data", "softball", "raw");
const processedRoot = resolve(projectRoot, "data", "softball", "processed");

const season = process.argv[2] ?? "2025";
const inputFileName = process.argv[3] ?? "players_table.html";

const voidTags = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

function tokenizeHtml(html) {
  return html.match(/<!--[\s\S]*?-->|<![^>]*>|<[^>]+>|[^<]+/g) ?? [];
}

function isClosingTag(token) {
  return /^<\//.test(token);
}

function isCommentOrDirective(token) {
  return /^<!--/.test(token) || /^<![^-]/.test(token);
}

function getTagName(token) {
  const match = token.match(/^<\/?\s*([a-zA-Z0-9:-]+)/);
  return match ? match[1].toLowerCase() : "";
}

function isSelfClosingTag(token) {
  if (/\/\s*>$/.test(token)) {
    return true;
  }
  return voidTags.has(getTagName(token));
}

function formatHtml(html) {
  const tokens = tokenizeHtml(html);
  const lines = [];
  let indentLevel = 0;

  for (const token of tokens) {
    const trimmed = token.trim();
    if (!trimmed) {
      continue;
    }

    if (isClosingTag(trimmed)) {
      indentLevel = Math.max(indentLevel - 1, 0);
    }

    const indent = "  ".repeat(indentLevel);

    if (trimmed.startsWith("<")) {
      lines.push(`${indent}${trimmed}`);
    } else {
      const textLines = trimmed
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      for (const line of textLines) {
        lines.push(`${indent}${line}`);
      }
    }

    if (
      trimmed.startsWith("<") &&
      !isClosingTag(trimmed) &&
      !isSelfClosingTag(trimmed) &&
      !isCommentOrDirective(trimmed)
    ) {
      indentLevel += 1;
    }
  }

  return `${lines.join("\n")}\n`;
}

function main() {
  const inputPath = resolve(rawRoot, season, inputFileName);
  const outputDir = resolve(processedRoot, "formatted_html", season);
  const extension = extname(inputFileName);
  const baseName = basename(inputFileName, extension);
  const outputPath = resolve(outputDir, `${baseName}.formatted${extension || ".html"}`);
  const html = readFileSync(inputPath, "utf8");
  const formatted = formatHtml(html);

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputPath, formatted, "utf8");

  console.log(`Formatted ${inputFileName} to ${outputPath}`);
}

main();
