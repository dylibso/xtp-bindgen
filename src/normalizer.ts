import * as parser from "./parser"

export interface XtpItemType extends Omit<parser.XtpItemType, '$ref'> {
  '$ref': Schema | null;
}

export interface Property extends Omit<parser.Property, '$ref'> {
  '$ref': Schema | null;
  nullable: boolean;
  items?: XtpItemType;
  name: string;
}

export function isProperty(p: any): p is Property {
  return !!p.type
}

export interface Schema extends Omit<parser.Schema, 'properties'> {
  properties: Property[];
  name: string;
}

export type SchemaMap = {
  [key: string]: Schema;
}

// Main Schema export interface
export interface XtpSchema {
  version: Version;
  exports: Export[];
  imports: Import[];
  schemas: SchemaMap;
}

export type Version = 'v0' | 'v1';
export type XtpType = parser.XtpType
export type XtpFormat = parser.XtpFormat
export type MimeType = parser.MimeType
export type Parameter = parser.Parameter

export interface Export {
  name: string;
  description?: string;
  codeSamples?: parser.CodeSample[];
  input?: Parameter;
  output?: Parameter;
}

export function isExport(e: any): e is Export {
  return parser.isSimpleExport(e) || parser.isComplexExport(e)
}

// These are the same for now
export type Import = Export

class NormalizerError extends Error {
  constructor(public message: string, public path: string) {
    super(message);
    Object.setPrototypeOf(this, NormalizerError.prototype);
  }
}

function normalizeV0Schema(parsed: parser.V0Schema): XtpSchema {
  const version = 'v0'
  const exports: Export[] = []
  const imports: Import[] = []
  const schemas = {}

  parsed.exports.forEach(ex => {
    exports.push({
      name: ex,
    })
  })

  return {
    version,
    exports,
    imports,
    schemas,
  }
}

function parseSchemaRef(ref: string, location: string): string {
  const parts = ref.split('/')
  if (parts[0] !== '#') throw new NormalizerError("Not a valid ref " + ref, location);
  if (parts[1] !== 'components') throw new NormalizerError("Not a valid ref " + ref, location);
  if (parts[2] !== 'schemas') throw new NormalizerError("Not a valid ref " + ref, location);
  return parts[3]
}

function normalizeProp(p: Parameter | Property | XtpItemType | parser.XtpItemType, s: Schema, location: string) {
  p.$ref = s
  p.description = p.description || s.description
  // double ensure that content types are lowercase
  if ('contentType' in p) {
    p.contentType = p.contentType.toLowerCase() as MimeType
  }
  if (!p.type) {
    p.type = 'string'
  }
  if (s.type) {
    // if it's not an object assume it's a string
    if (s.type === 'object') {
      p.type = 'object'
    }
  }
}

function validateArrayItems(arrayItem: XtpItemType | parser.XtpItemType | undefined, location: string): void {
  if (!arrayItem || !arrayItem.type) {
    return;
  }

  validateTypeAndFormat(arrayItem.type, arrayItem.format, location);
}

function validateTypeAndFormat(type: XtpType, format: XtpFormat | undefined, location: string): void {
  const validTypes = ['string', 'number', 'integer', 'boolean', 'object', 'array'];
  if (!validTypes.includes(type)) {
    throw new NormalizerError(`Invalid type ${type}`, location);
  }

  if (!format) {
    return;
  }

  let validFormats: XtpFormat[] = [];
  if (type === 'string') {
    validFormats = ['date-time', 'byte'];
  } else if (type === 'number') {
    validFormats = ['float', 'double'];
  } else if (type === 'integer') {
    validFormats = ['int32', 'int64'];
  }

  if (!validFormats.includes(format)) {
    throw new NormalizerError(`Invalid format ${format} for type ${type}. Valid formats are: ${validFormats.join(', ')}`, location);
  }
}

function normalizeV1Schema(parsed: parser.V1Schema): XtpSchema {
  const version = 'v1'
  const exports: Export[] = []
  const imports: Import[] = []
  const schemas: SchemaMap = {}

  // need to index all the schemas first
  for (const name in parsed.components?.schemas) {
    const s = parsed.components.schemas[name]
    const properties: Property[] = []
    for (const pName in s.properties) {
      const p = s.properties[pName] as Property
      p.name = pName
      properties.push(p)

      if (p.items?.$ref) {
        validateArrayItems(p.items, `#/components/schemas/${name}/properties/${pName}/items`);
      }
    }

    // overwrite the name
    // overwrite new properties shape
    schemas[name] = {
      ...s,
      name,
      properties,
    }
  }

  // denormalize all the properties in a second loop
  for (const name in schemas) {
    const s = schemas[name]

    s.properties?.forEach((p, idx) => {
      // link the property with a reference to the schema if it has a ref
      // need to get the ref from the parsed (raw) property
      const rawProp = parsed.components!.schemas![name].properties![p.name]
      const propLocation = `#/components/schemas/${name}/properties/${p.name}`;

      if (rawProp.$ref) {
        normalizeProp(
          schemas[name].properties[idx],
          schemas[parseSchemaRef(rawProp.$ref, propLocation)],
          propLocation
        )
      }

      if (rawProp.items?.$ref) {
        normalizeProp(
          p.items!,
          schemas[parseSchemaRef(rawProp.items!.$ref, `${propLocation}/items`)],
          `${propLocation}/items`
        )
      }

      validateTypeAndFormat(p.type, p.format, propLocation);
      validateArrayItems(p.items, `${propLocation}/items`);

      // coerce to false by default
      p.nullable = p.nullable || false
    })
  }

  // Denormalize exports
  for (const name in parsed.exports) {
    let ex = parsed.exports[name]

    if (parser.isComplexExport(ex)) {
      const normEx = ex as Export
      normEx.name = name

      if (ex.input?.$ref) {
        normalizeProp(
          normEx.input!,
          schemas[parseSchemaRef(ex.input.$ref, `#/exports/${name}/input`)],
          `#/exports/${name}/input`
        )
      }
      if (ex.input?.items?.$ref) {
        normalizeProp(
          normEx.input!.items!,
          schemas[parseSchemaRef(ex.input.items.$ref, `#/exports/${name}/input/items`)],
          `#/exports/${name}/input/items`
        )
      }

      if (ex.output?.$ref) {
        normalizeProp(
          normEx.output!,
          schemas[parseSchemaRef(ex.output.$ref, `#/exports/${name}/output`)],
          `#/exports/${name}/output`
        )
      }
      if (ex.output?.items?.$ref) {
        normalizeProp(
          normEx.output!.items!,
          schemas[parseSchemaRef(ex.output.items.$ref, `#/exports/${name}/output/items`)],
          `#/exports/${name}/output/items`
        )
      }

      validateArrayItems(normEx.input?.items, `#/exports/${name}/input/items`);
      validateArrayItems(normEx.output?.items, `#/exports/${name}/output/items`);

      exports.push(normEx)
    } else if (parser.isSimpleExport(ex)) {
      // it's just a name
      exports.push({ name })
    } else {
      throw new NormalizerError("Unable to match export to a simple or a complex export", `#/exports/${name}`);
    }
  }

  // denormalize all the imports
  for (const name in parsed.imports) {
    const im = parsed.imports![name]

    // they have the same type
    const normIm = im as Import
    normIm.name = name

    // deref input and output
    if (im.input?.$ref) {
      normalizeProp(
        normIm.input!,
        schemas[parseSchemaRef(im.input.$ref, `#/imports/${name}/input`)],
        `#/imports/${name}/input`
      )
    }
    if (im.input?.items?.$ref) {
      normalizeProp(
        normIm.input!.items!,
        schemas[parseSchemaRef(im.input.items.$ref, `#/imports/${name}/input/items`)],
        `#/imports/${name}/input/items`
      )
    }

    if (im.output?.$ref) {
      normalizeProp(
        normIm.output!,
        schemas[parseSchemaRef(im.output.$ref, `#/imports/${name}/output`)],
        `#/imports/${name}/output`
      )
    }
    if (im.output?.items?.$ref) {
      normalizeProp(
        normIm.output!.items!,
        schemas[parseSchemaRef(im.output.items.$ref, `#/imports/${name}/output/items`)],
        `#/imports/${name}/output/items`
      )
    }

    validateArrayItems(normIm.input?.items, `#/imports/${name}/input/items`);
    validateArrayItems(normIm.output?.items, `#/imports/${name}/output/items`);

    imports.push(normIm)
  }

  return {
    version,
    exports,
    imports,
    schemas,
  }
}

export function parseAndNormalizeJson(encoded: string): XtpSchema {
  const parsed = parser.parseJson(encoded)

  if (parser.isV0Schema(parsed)) {
    return normalizeV0Schema(parsed)
  } else if (parser.isV1Schema(parsed)) {
    return normalizeV1Schema(parsed)
  } else {
    throw new NormalizerError("Could not normalize unknown version of schema", "#");
  }
}

function detectCircularReference(schema: Schema, visited: Set<Schema> = new Set()): NormalizerError | null {
  if (visited.has(schema)) {
    return new NormalizerError("Circular reference detected", `#/schemas/${schema.name}`);
  }

  visited.add(schema);

  for (const property of schema.properties) {
    if (property.$ref) {
      const error = detectCircularReference(property.$ref, new Set(visited));
      if (error) {
        return error;
      }
    }
  }

  return null;
}

export function validateSchema(schema: XtpSchema): NormalizerError[] {
  const errors: NormalizerError[] = [];

  // Check for circular references
  for (const schemaName in schema.schemas) {
    const error = detectCircularReference(schema.schemas[schemaName]);
    if (error) {
      errors.push(error);
    }
  }

  return errors;
}