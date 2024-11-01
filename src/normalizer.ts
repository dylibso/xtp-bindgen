/**
 * Normalize reduces the XTP schema down into a simpler, IR-like form.
 *
 * The primary purpose is to iterate through the raw parsed document
 * and normalize away some of the hairy XTP details into our own narrow format.
 */
import { ValidationError } from "./common";
import * as parser from "./parser"
import {
  XtpNormalizedType,
  StringType, ObjectType, EnumType, ArrayType, MapType,
  DateTimeType,
  Int32Type,
  Int64Type,
  FloatType,
  DoubleType,
  BooleanType,
  BufferType,
} from "./types"

export interface XtpTyped extends parser.XtpTyped {
  description?: string;
  // we are deriving these values
  xtpType: XtpNormalizedType;
}

export interface Parameter extends parser.Parameter {
  // we are deriving these values
  xtpType: XtpNormalizedType;
}

export interface Property extends Omit<parser.Property, '$ref'> {
  // we're gonna change this from a string to a Schema object
  '$ref': Schema | null;

  // we are deriving these values
  required: boolean;
  name: string;
  xtpType: XtpNormalizedType;
}

// TODO fix this?
export function isProperty(p: any): p is Property {
  return !!p.type
}

export interface Schema extends Omit<parser.Schema, 'properties' | 'additionalProperties'> {
  properties: Property[];
  additionalProperties?: XtpTyped;
  name: string;

  // we are deriving these values
  xtpType: XtpNormalizedType;
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
  input?: Parameter;
  output?: Parameter;
}

// TODO fix
export function isExport(e: any): e is Export {
  return !!e.name
}

// These are the same for now
export type Import = Export

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

class V1SchemaNormalizer {
  version = 'v1'
  exports: Export[] = []
  imports: Import[] = []
  schemas: SchemaMap = {}
  parsed: parser.V1Schema

  constructor(parsed: parser.V1Schema) {
    this.parsed = parsed
  }

  normalize(): XtpSchema {
    // First let's create all our normalized schemas
    // we need these first so we can point $refs to them 
    for (const name in this.parsed.components?.schemas) {
      const pSchema = this.parsed.components.schemas[name]

      // turn any parser.Property map we have into Property[]
      const properties = []
      if (pSchema.properties) {
        for (const name in pSchema.properties) {
          const required = pSchema.required?.includes(name)
          properties.push({ ...pSchema.properties[name], name, required } as Property)
        }
      }

      // we hard cast instead of copy we we can mutate the $refs later
      // TODO find a way around this
      const schema = (pSchema as unknown) as Schema
      schema.name = name
      schema.properties = properties
      this.schemas[name] = schema
    }

    // recursively annotate all typed interfaces in the document
    this.annotateType(this.parsed as any)

    // normalize exports
    for (const name in this.parsed.exports) {
      const ex = this.parsed.exports[name] as Export
      ex.name = name
      this.exports.push(ex)
    }

    // normalize imports
    for (const name in this.parsed.imports) {
      const im = this.parsed.imports[name] as Import
      im.name = name
      this.imports.push(im)
    }

    return {
      version: 'v1',
      exports: this.exports,
      imports: this.imports,
      schemas: this.schemas,
    }
  }

  querySchemaRef(ref: string, location: string): Schema {
    const parts = ref.split('/')
    if (parts[0] !== '#') throw new Error("Not a valid ref " + ref);
    if (parts[1] !== 'components') throw new Error("Not a valid ref " + ref);
    if (parts[2] !== 'schemas') throw new Error("Not a valid ref " + ref);
    const name = parts[3];

    const s = this.schemas[name]
    if (!s) {
      const availableSchemas = Object.keys(this.schemas).join(', ')
      throw new Error(`invalid reference ${ref}. Cannot find schema ${name}. Options are: ${availableSchemas}`);
    }

    return s
  }

  // Recursively derive and annotate types
  annotateType(s: any): XtpNormalizedType | undefined {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return undefined
    if (s.xtpType) return s.xtpType // no need to recalculate

    // we can assume this is an object type
    // if it has type = 'object' or has properties present
    if ((s.type && s.type === 'object') ||
      (s.properties && s.properties.length > 0)) {

      const properties: XtpNormalizedType[] = []
      for (const pname in s.properties!) {
        const p = s.properties[pname]
        const t = this.annotateType(p)!
        p.xtpType = t
        properties.push(t)
      }

      // TODO remove this legacy code
      // we need to derive old type here
      s.type = 'object'

      return new ObjectType(s.name!, properties, s)
    }

    if (s.$ref) {
      let ref = s.$ref
      // this conditional takes the place of all the legacy code to replace
      // the sring with the ref
      if (typeof s.$ref === 'string') {
        ref = this.querySchemaRef(s.$ref, '')
        s.$ref = ref
      }

      // TODO remove this legacy code
      // we need to derive old type here
      s.type = 'object'

      return this.annotateType(ref)!
    }

    // enums can only be string enums right now
    if (s.enum) {
      // TODO remove this legacy code
      // we need to derive old type here
      s.type = 'enum'

      return new EnumType(s.name!, new StringType(), s.enum, s)
    }

    // if items is present it's an array
    if (s.items) {
      return new ArrayType(this.annotateType(s.items)!, s)
    }

    // if additionalProperties is present it's a map
    if (s.additionalProperties) {
      // TODO remove this legacy code
      // we need to derive old type here
      s.type = 'map'

      return new MapType(this.annotateType(s.additionalProperties)!, s)
    }

    switch (s.type) {
      case 'string':
        if (s.format === 'date-time') return new DateTimeType(s)
        return new StringType(s)
      case 'integer':
        return new Int32Type(s)
      case 'boolean':
        return new BooleanType(s)
      case 'buffer':
        return new BufferType(s)
      case 'number':
        if (s.format === 'int32') return new Int32Type(s)
        if (s.format === 'int64') return new Int64Type(s)
        if (s.format === 'float') return new FloatType(s)
        if (s.format === 'double') return new DoubleType(s)
        throw new Error(`IDK how to parse this number ${JSON.stringify(s)}`)
    }

    // if we get this far, we don't know what
    // this node is let's just keep drilling down
    for (const key in s) {
      if (Object.prototype.hasOwnProperty.call(s, key)) {
        const child = s[key]
        if (child && typeof child === 'object' && !Array.isArray(child)) {
          const t = this.annotateType(child);
          if (t) child.xtpType = t
        }
      }
    }
  }
}

function normalizeV1Schema(parsed: parser.V1Schema): XtpSchema {
  const normalizer = new V1SchemaNormalizer(parsed)
  return normalizer.normalize()
}

export function parseAndNormalizeJson(encoded: string): XtpSchema {
  const { doc, errors } = parser.parseAny(JSON.parse(encoded))

  if (errors && errors.length > 0) {
    console.log(JSON.stringify(errors))
    throw Error(`Invalid document`)
  }

  if (parser.isV0Schema(doc)) {
    return normalizeV0Schema(doc)
  } else if (parser.isV1Schema(doc)) {
    return normalizeV1Schema(doc)
  } else {
    throw new Error("Could not normalize unknown version of schema");
  }
}
