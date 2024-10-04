import {
  Export,
  Import,
  isExport,
  isProperty,
  Parameter,
  parseAndNormalizeJson,
  Property,
  XtpSchema,
} from "./normalizer";
import { CodeSample } from "./parser";
export * from "./normalizer";
export { ValidationError } from "./common";

export function parse(schema: string) {
  return parseAndNormalizeJson(schema);
}

export interface XtpProject {
  name: string;
  description: string;
  appId: string;
  extensionPointId: string;
}

export interface XtpContext {
  schema: XtpSchema;
  project: XtpProject;
  featureFlags?: { [keyof: string]: any };
}

export function getContext(): XtpContext {
  const ctx = JSON.parse(Config.get("ctx") || "{}");
  ctx.schema = parse(JSON.stringify(ctx.schema));

  if (Array.isArray(ctx.featureFlags)) {
    ctx.featureFlags = ctx.featureFlags.reduce((a: any, c: any) => {
      a[c] = true;
      return a;
    }, {});
  } else {
    ctx.featureFlags = ctx.featureFlags || {};
  }

  return ctx;
}

function codeSamples(ex: Export, lang: string): CodeSample[] {
  if (!ex.codeSamples) {
    return [];
  }

  return ex.codeSamples.filter((s) =>
    s.lang.toLowerCase() === lang.toLowerCase()
  )!;
}

// template helpers
function hasComment(
  p: Parameter | Property | Export | Import | null | undefined,
): boolean {
  if (!p) return false;

  if (isProperty(p)) {
    return !!(p.description || p.$ref);
  } else if (isExport(p)) { // should cover import and export
    return !!(
      p.description ||
      hasComment(p.input) ||
      hasComment(p.output)
    );
  }

  return false;
}

// Formats comment to fit on a single line
function formatCommentLine(s: string | null) {
  if (!s) return "";
  return s.trimEnd().replace(/\n/g, " ");
}

// Formats comment to a block
function formatCommentBlock(s: string | null, prefix?: string) {
  if (!s) return "";
  if (!prefix) prefix = " * ";
  return s.trimEnd().replace(/\n/g, `\n${prefix}`);
}

function isJsonEncoded(p: Parameter | null): boolean {
  if (!p) return false;
  return p.contentType === "application/json";
}

function isUtf8Encoded(p: Parameter | null): boolean {
  if (!p) return false;
  return p.contentType === "text/plain; charset=utf-8";
}

function isPrimitive(p: Property | Parameter): boolean {
  if (!p.$ref) return true;
  // enums are currently primitive (strings)
  // schemas with props are not (needs to be encoded)
  return !!p.$ref.enum || !p.$ref.properties;
}

function isDateTime(p: Property | Parameter | null): boolean {
  if (!p) return false;
  return p.type === "string" && p.format === "date-time";
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function camelToSnakeCase(s: string) {
  return s.split(/(?=[A-Z])/).join("_").toLowerCase();
}

function snakeToCamelCase(s: string) {
  return s.split("_").map((part, index) => {
    if (index === 0) return part;
    return part.charAt(0).toUpperCase() + part.slice(1);
  }).join("");
}

function snakeToPascalCase(s: string) {
  return capitalize(snakeToCamelCase(s));
}

export const helpers = {
  hasComment,
  formatCommentLine,
  formatCommentBlock,
  codeSamples,
  isDateTime,
  isPrimitive,
  isJsonEncoded,
  isUtf8Encoded,
  capitalize,
  camelToSnakeCase,
  snakeToCamelCase,
  snakeToPascalCase,
};
