import { ValidationError } from "./common";

// Main Schema export interface
export interface V0Schema {
  version: Version;
  exports: SimpleExport[];
}

export interface V1Schema {
  version: Version;
  exports: { [name: string]: Export };
  imports?: { [name: string]: Import };
  components?: {
    schemas?: { [name: string]: Schema };
  }
}

type VUnknownSchema = V0Schema | V1Schema

export type Version = 'v0' | 'v1-draft';

// for now, imports and exports look the same
export type Import = Export

export type SimpleExport = string;

export interface Export {
  name: string;
  description?: string;
  codeSamples?: CodeSample[];
  input?: Parameter;
  output?: Parameter;
}

export interface CodeSample {
  lang: string;
  source: string;
  label?: string;
}

export type MimeType = 'application/json' | 'text/plain; charset=utf-8' | 'application/x-binary'

export interface Schema {
  description: string;
  type?: XtpSchemaType;
  enum?: string[];
  properties?: { [name: string]: Property };
  required?: string[];
}

export type XtpSchemaType = 'object' | 'enum'
export type XtpType =
  'integer' | 'string' | 'number' | 'boolean' | 'object' | 'array' | 'buffer';
export type XtpFormat =
  'int32' | 'int64' | 'float' | 'double' | 'date-time' | 'byte';

export interface XtpItemType {
  type: XtpType;
  format?: XtpFormat;
  // NOTE: needs to be any to satisfy type satisfy
  // type system in normalizer
  "$ref"?: any;
  description?: string;
  additionalProperties?: AdditionalProperties;

  // we only support one nested item type for now
  // type: XtpType | XtpItemType;
}

export interface Parameter extends Property {
  contentType: MimeType;
}

export interface Property {
  type: XtpType;
  items?: XtpItemType;
  format?: XtpFormat;
  description?: string;
  nullable?: boolean;
  additionalProperties?: AdditionalProperties;

  // NOTE: needs to be any to satisfy type safity in normalizer
  "$ref"?: any;
}

// we only support one level of nested map for now
export interface AdditionalProperties extends Omit<Property, 'description' | 'additionalProperties'> {

}

export function parseJson(encoded: string): VUnknownSchema {
  let parsed: any;
  try {
    parsed = JSON.parse(encoded);
  } catch (e) {
    throw new ValidationError("Invalid JSON", "#");
  }

  if (!parsed.version) throw new ValidationError("version property missing", "#");
  switch (parsed.version) {
    case 'v0':
      return parsed as V0Schema;
    case 'v1-draft':
      return parsed as V1Schema;
    default:
      throw new ValidationError(`version property not valid: ${parsed.version}`, "#/version");
  }
}

export function isV0Schema(schema: VUnknownSchema): schema is V0Schema {
  return schema.version === 'v0';
}

export function isV1Schema(schema: VUnknownSchema): schema is V1Schema {
  return schema.version === 'v1-draft';
}