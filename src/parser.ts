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

export type Export = SimpleExport | ComplexExport;

// for now, imports and exports look the same
export type Import = ComplexExport

export function isComplexExport(exportItem: Export): exportItem is ComplexExport {
  return typeof exportItem === 'object' && 'description' in exportItem;
}

export function isSimpleExport(exportItem: Export): exportItem is SimpleExport {
  return typeof exportItem === 'string';
}

export type SimpleExport = string;

export interface ComplexExport {
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

  // NOTE: needs to be any to satisfy type satisfy
  // type system in normalizer
  "$ref"?: any;
}

class ParseError extends Error {
  constructor(public message: string, public path: string) {
    super(message);
    Object.setPrototypeOf(this, ParseError.prototype);
  }
}

export function parseJson(encoded: string): VUnknownSchema {
  let parsed: any;
  try {
    parsed = JSON.parse(encoded);
  } catch (e) {
    throw new ParseError("Invalid JSON", "#");
  }
  
  if (!parsed.version) throw new ParseError("version property missing", "#");
  switch (parsed.version) {
    case 'v0':
      validateV0Schema(parsed);
      return parsed as V0Schema;
    case 'v1-draft':
      validateV1Schema(parsed);
      return parsed as V1Schema;
    default:
      throw new ParseError(`version property not valid: ${parsed.version}`, "#/version");
  }
}

function validateV0Schema(schema: any) {
  if (!Array.isArray(schema.exports)) {
    throw new ParseError("exports must be an array", "#/exports");
  }
  schema.exports.forEach((exp: any, index: number) => {
    if (typeof exp !== 'string') {
      throw new ParseError(`export must be a string`, `#/exports/${index}`);
    }
  });
}

function validateV1Schema(schema: any) {
  if (typeof schema.exports !== 'object') {
    throw new ParseError("exports must be an object", "#/exports");
  }
  for (const [name, exp] of Object.entries(schema.exports)) {
    validateExport(exp as Export, `#/exports/${name}`);
  }
  if (schema.imports) {
    if (typeof schema.imports !== 'object') {
      throw new ParseError("imports must be an object", "#/imports");
    }
    for (const [name, imp] of Object.entries(schema.imports)) {
      validateImport(imp as Import, `#/imports/${name}`);
    }
  }
  if (schema.components?.schemas) {
    if (typeof schema.components.schemas !== 'object') {
      throw new ParseError("components.schemas must be an object", "#/components/schemas");
    }
    for (const [name, sch] of Object.entries(schema.components.schemas)) {
      validateSchema(sch as Schema, `#/components/schemas/${name}`);
    }
  }
}

function validateExport(exp: Export, location: string) {
  if (isSimpleExport(exp)) return;
  if (!isComplexExport(exp)) {
    throw new ParseError("Invalid export format", location);
  }
  if (exp.input) validateParameter(exp.input, `${location}/input`);
  if (exp.output) validateParameter(exp.output, `${location}/output`);
}

function validateImport(imp: Import, location: string) {
  if (!isComplexExport(imp)) {
    throw new ParseError("Invalid import format", location);
  }
  if (imp.input) validateParameter(imp.input, `${location}/input`);
  if (imp.output) validateParameter(imp.output, `${location}/output`);
}

function validateParameter(param: Parameter, location: string) {
  if (!param.contentType) {
    throw new ParseError("contentType is required for parameters", location);
  }
  validateProperty(param, location);
}

function validateProperty(prop: Property, location: string) {
  if (!prop.type) {
    throw new ParseError("type is required for properties", location);
  }
  if (prop.items && prop.type !== 'array') {
    throw new ParseError("items is only allowed for array type", location);
  }
  if (prop.items) validateXtpItemType(prop.items, `${location}/items`);
}

function validateXtpItemType(item: XtpItemType, location: string) {
  if (!item.type) {
    throw new ParseError("type is required for items", location);
  }
}

function validateSchema(schema: Schema, location: string) {
  if (!schema.type) {
    throw new ParseError("type is required for schemas", location);
  }
  if (schema.type === 'object' && !schema.properties) {
    throw new ParseError("properties are required for object schemas", location);
  }
  if (schema.properties) {
    for (const [name, prop] of Object.entries(schema.properties)) {
      validateProperty(prop, `${location}/properties/${name}`);
    }
  }
}

export function isV0Schema(schema: VUnknownSchema): schema is V0Schema {
  return schema.version === 'v0';
}

export function isV1Schema(schema: VUnknownSchema): schema is V1Schema {
  return schema.version === 'v1-draft';
}