import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function ensureDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

export function decodeHtmlEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function stripTags(value) {
  return decodeHtmlEntities(String(value ?? ""))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeHeader(value) {
  return stripTags(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function makeUniqueHeaders(headers) {
  const counts = new Map();

  return headers.map((header, index) => {
    const baseHeader = String(header || `col_${index + 1}`).trim() || `col_${index + 1}`;
    const seen = counts.get(baseHeader) ?? 0;
    counts.set(baseHeader, seen + 1);

    if (seen === 0) {
      return baseHeader;
    }

    return `${baseHeader}_${seen + 1}`;
  });
}

export function slugify(value) {
  return stripTags(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function canonicalizeName(value) {
  return stripTags(value)
    .toUpperCase()
    .replace(/\bSUB\b/g, "SUB")
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function csvCell(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export function writeCsv(filePath, headers, rows) {
  ensureDir(filePath);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvCell(row[header] ?? "")).join(","));
  }
  writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

export function writeJson(filePath, value) {
  ensureDir(filePath);
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function parseCsv(text) {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(current);
      if (row.some((cell) => cell !== "")) {
        rows.push(row);
      }
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  if (current !== "" || row.length > 0) {
    row.push(current);
    if (row.some((cell) => cell !== "")) {
      rows.push(row);
    }
  }

  if (rows.length === 0) {
    return [];
  }

  const [headers, ...dataRows] = rows;
  return dataRows.map((dataRow) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = dataRow[index] ?? "";
    });
    return record;
  });
}

export function toNumber(value) {
  if (value == null) {
    return null;
  }

  const text = String(value).trim();
  if (text === "") {
    return null;
  }

  const parsed = Number(text.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function toRate(value) {
  const numeric = toNumber(value);
  if (numeric == null) {
    return null;
  }

  return numeric > 1 ? numeric / 1000 : numeric;
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function average(values) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function parseAttributes(fragment) {
  const attributes = {};
  for (const match of fragment.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)=(["'])(.*?)\2/g)) {
    attributes[match[1]] = decodeHtmlEntities(match[3]);
  }
  return attributes;
}

export function uniqueBy(items, getKey) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const key = getKey(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(item);
  }
  return output;
}

export function parseHtmlTables(html) {
  const tables = [];
  for (const tableMatch of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const tableHtml = tableMatch[1];
    const headerMatches = [...tableHtml.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)];
    const headers = headerMatches.map((match) => stripTags(match[1]));
    const rows = [];

    for (const rowMatch of tableHtml.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)) {
      const attrs = parseAttributes(rowMatch[1]);
      const rowHtml = rowMatch[2];
      const cellMatches = [...rowHtml.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)];
      if (cellMatches.length === 0) {
        continue;
      }
      rows.push({
        attrs,
        cells: cellMatches.map((match) => stripTags(match[1])),
        html: rowHtml,
      });
    }

    tables.push({ headers, rows, html: tableHtml });
  }

  return tables;
}

export function encodeTurboStatsUrl(url) {
  const parsed = new URL(url);
  parsed.pathname = parsed.pathname
    .split("/")
    .map((segment) => encodeURIComponent(decodeHtmlEntities(segment)))
    .join("/");

  const nextParams = new URLSearchParams();
  for (const [key, value] of parsed.searchParams.entries()) {
    nextParams.append(key, decodeHtmlEntities(value));
  }
  parsed.search = nextParams.toString() ? `?${nextParams.toString()}` : "";

  return parsed.toString();
}
