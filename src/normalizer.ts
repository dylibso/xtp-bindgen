import * as parser from "./parser"

export interface XtpItemType extends Omit<parser.XtpItemType, '$ref'> {
  '$ref': Schema | null;
}

export interface Property extends Omit<parser.Property, '$ref'> {
  '$ref': Schema | null;
  nullable: boolean;
  items?: XtpItemType;
}

export function isProperty(p: any): p is Property {
  return !!p.type
}

export interface Schema extends Omit<parser.Schema, 'properties'> {
  properties: Property[];
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

export interface Export {
  name: string;
  description?: string;
  codeSamples?: parser.CodeSample[];
  input?: Property;
  output?: Property;
}

export function isExport(e: any): e is Export {
  return parser.isSimpleExport(e) || parser.isComplexExport(e)
}

// These are the same for now
export type Import = Export

class NormalizerError extends Error {
  constructor(m: string) {
    super(m);
    Object.setPrototypeOf(this, NormalizerError.prototype);
  }
}

function normalizeV0Schema(parsed: parser.V0Schema): XtpSchema {
  const version = 'v0'
  const exports: Export[] = []
  // we don't have any schemas or imports
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

function parseSchemaRef(ref: string): string {
  const parts = ref.split('/')
  if (parts[0] !== '#') throw Error("Not a valid ref " + ref)
  if (parts[1] !== 'schemas') throw Error("Not a valid ref " + ref)
  return parts[2]
}

function normalizeProp(p: Property | XtpItemType, s: Schema) {
  p.$ref = s
  p.type = s.type || 'string' // TODO: revisit string default, isn't type required?
  p.contentType = p.contentType || s.contentType
  p.description = p.description || s.description
}

function normalizeV1Schema(parsed: parser.V1Schema): XtpSchema {
  const version = 'v1'
  const exports: Export[] = []
  const imports: Import[] = []
  const schemas: SchemaMap = {}

  // need to index all the schemas first
  parsed.schemas?.forEach(s => {
    schemas[s.name] = s as Schema
  })

  // denormalize all the properties in a second loop
  parsed.schemas?.forEach(s => {
    s.properties?.forEach((p, idx) => {
      // link the property with a reference to the schema if it has a ref
      if (p.$ref) {
        normalizeProp(
          schemas[s.name].properties[idx],
          schemas[parseSchemaRef(p.$ref)]
        )
      }

      if (p.items?.$ref) {
        normalizeProp(
          //@ts-ignore
          p.items!,
          schemas[parseSchemaRef(p.items!.$ref)]
        )
      }

      // add set nullable property from the required array
      // TODO: consider supporting nullable instead of required
      // @ts-ignore
      p.nullable = !s.required?.includes(p.name)
    })
  })

  // denormalize all the exports
  parsed.exports.forEach(ex => {
    if (parser.isComplexExport(ex)) {
      // they have the same type
      // deref input and output
      const normEx = ex as Export
      if (ex.input?.$ref) {
        normalizeProp(
          normEx.input!,
          schemas[parseSchemaRef(ex.input.$ref)]
        )
      }
      if (ex.input?.items?.$ref) {
        normalizeProp(
          //@ts-ignore
          normEx.input.items!,
          schemas[parseSchemaRef(ex.input.items.$ref)]
        )
      }

      if (ex.output?.$ref) {
        normalizeProp(
          normEx.output!,
          schemas[parseSchemaRef(ex.output.$ref)]
        )
      }
      if (ex.output?.items?.$ref) {
        normalizeProp(
          // @ts-ignore
          normEx.output.items!,
          schemas[parseSchemaRef(ex.output.items.$ref)]
        )
      }

      exports.push(normEx)
    } else if (parser.isSimpleExport(ex)) {
      // it's just a name
      exports.push({ name: ex })
    } else {
      throw new NormalizerError("Unable to match export to a simple or a complex export")
    }
  })

  // denormalize all the imports
  parsed.imports?.forEach(im => {
    // they have the same type
    const normIm = im as Import
    // deref input and output
    if (im.input?.$ref) {
      normalizeProp(
        normIm.input!,
        schemas[parseSchemaRef(im.input.$ref)]
      )
    }
    if (im.input?.items?.$ref) {
      normalizeProp(
        // @ts-ignore
        normIm.input.items!,
        schemas[parseSchemaRef(im.input.items.$ref)]
      )
    }

    if (im.output?.$ref) {
      normalizeProp(
        normIm.output!,
        schemas[parseSchemaRef(im.output.$ref)]
      )
    }
    if (im.output?.items?.$ref) {
      normalizeProp(
        // @ts-ignore
        normIm.output.items!,
        schemas[parseSchemaRef(im.output.items.$ref)]
      )
    }

    imports.push(normIm)
  })

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
    throw new NormalizerError("Could not normalized unknown version of schema")
  }
}

