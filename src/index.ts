import { parseAndNormalizeJson } from "./normalizer";
export * from "./normalizer"

export function parse(schema: string) {
  return parseAndNormalizeJson(schema)
}
