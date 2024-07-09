// Main Schema export interface
export interface V0Schema {
  version: Version;
  exports: SimpleExport[];
}

export interface V1Schema {
  version: Version;
  exports: Export[];
  imports?: Import[];
  schemas?: Schema[];
}

type VUnknownSchema = V0Schema | V1Schema

export type Version = 'v0' | 'v1-draft';

export type Export = SimpleExport | ComplexExport;

// for now, imports and exports look the same
export type Import = ComplexExport

export function isComplexExport(exportItem: Export): exportItem is ComplexExport {
  return typeof exportItem === 'object' && 'name' in exportItem;
}

export function isSimpleExport(exportItem: Export): exportItem is SimpleExport {
  return typeof exportItem === 'string';
}

export function isProperty(p: Property): p is Property {
  return true
}

export function isSchema(s: Schema): s is Schema {
  return true
}

export type SimpleExport = string;

export interface ComplexExport {
  name: string;
  description?: string;
  codeSamples?: CodeSample[];
  input?: Property;
  output?: Property;
}

export interface CodeSample {
  lang: 'typescript';
  source: string;
  label?: string;
}

export type MimeType = 'application/json' | 'text/plain; charset=UTF-8'

export interface Schema {
  name: string;
  description: string;
  type?: XtpType;
  enum?: string[];
  contentType?: MimeType;
  required?: string[];
  properties?: Property[];
}

export type XtpType =
  'integer' | 'string' | 'number' | 'boolean' | 'object' | 'array' | 'buffer';
export type XtpFormat =
  'int32' | 'int64' | 'float' | 'double' | 'date' | 'date-time' | 'byte';

export interface Property {
  name: string;
  type: XtpType
  format?: XtpFormat;
  contentType?: MimeType;
  description?: string;
  minimum?: number;
  maximum?: number;
  default?: string;

  // NOTE: needs to be any to satisfy type satisfy
  // type system in normalizer
  "$ref"?: any;
}

class ParseError extends Error {
  constructor(m: string) {
    super(m);
    Object.setPrototypeOf(this, ParseError.prototype);
  }
}

export function parseJson(encoded: string): VUnknownSchema {
  let parsed = JSON.parse(encoded)
  if (!parsed.version) throw new ParseError("version property missing")
  switch (parsed.version) {
    case 'v0':
      return parsed as V0Schema
    case 'v1-draft':
      return parsed as V1Schema
    default:
      throw new ParseError(`version property not valid: ${parsed.version}`)
  }
}

export function isV0Schema(schema: VUnknownSchema): schema is V0Schema {
  return schema.version === 'v0';
}

export function isV1Schema(schema: VUnknownSchema): schema is V1Schema {
  return schema.version === 'v1-draft';
}


