import { parseAndNormalizeJson, Property, Import, Export, isProperty, isExport, XtpSchema } from "./normalizer";
export * from "./normalizer"

export function parse(schema: string) {
  return parseAndNormalizeJson(schema)
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
  featureFlags?: string[];
}

export function getContext(): XtpContext {
  const ctx = JSON.parse(Config.get('ctx') || '{}')
  ctx.schema = parse(JSON.stringify(ctx.schema))
  return ctx
}

// template helpers 
function hasComment(p: Property | Export | Import | null | undefined): boolean {
  if (!p) return false

  if (isProperty(p)) {
    return !!(p.description || p.$ref)
  } else if (isExport(p)) { // should cover import and export
    return !!(
      p.description
      || hasComment(p.input)
      || hasComment(p.output)
    )
  }

  return false
}

// Formats comment to fit on a single line
function formatCommentLine(s: string | null) {
  if (!s) return ""
  return s.trimEnd().replace(/\n/g, ' ')
}

// Formats comment to a block
function formatCommentBlock(s: string | null, prefix?: string) {
  if (!s) return ""
  if (!prefix) prefix = ' * '
  return s.trimEnd().replace(/\n/g, `\n${prefix}`)
}

export const helpers = {
  hasComment,
  formatCommentLine,
  formatCommentBlock,
}
