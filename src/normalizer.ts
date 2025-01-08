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
  UInt8Type,
  Int8Type,
  UInt16Type,
  Int16Type,
  UInt32Type,
  Int32Type,
  UInt64Type,
  Int64Type,
  FloatType,
  DoubleType,
  BooleanType,
  BufferType,
  FreeFormObjectType
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
export interface XtpSchema extends parser.ParseResults {
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
  const exports: Export[] = []
  const imports: Import[] = []
  const schemas = {}
  const errors = parsed.errors
  const warnings = parsed.warnings

  parsed.exports.forEach(ex => {
    exports.push({
      name: ex,
    })
  })

  return {
    version: 'v0',
    exports,
    imports,
    schemas,
    errors,
    warnings,
  }
}

interface CycleDetectionContext {
  visited: Set<string>;
  stack: Set<string>;
  path: string[];
  errors: ValidationError[];
}

function detectSchemaRefCycles(
  schema: Schema,
  schemas: SchemaMap,
  context: CycleDetectionContext
): void {
  const schemaName = schema.name;

  // If we've seen this schema in current path, we have a cycle
  if (context.stack.has(schemaName)) {
    const cycle = context.path.slice(context.path.indexOf(schemaName));
    cycle.push(schemaName); // Complete the cycle
    context.errors.push(
      new ValidationError(
        `Detected circular reference: ${cycle.join(' -> ')}`,
        context.path.join('/')
      )
    );
    return;
  }

  // If we've already fully validated this schema, skip
  if (context.visited.has(schemaName)) {
    return;
  }

  // Add to current path stack
  context.stack.add(schemaName);
  context.path.push(schemaName);

  // Helper function to check anything that might have a $ref
  function checkPossibleRef(obj: any, label: string) {
    if (!obj) return;
    context.path.push(label);

    // Check direct $ref
    if (obj.$ref && typeof obj.$ref !== 'string') {
      detectSchemaRefCycles(obj.$ref, schemas, context);
    }

    // Check array items
    if (obj.items) {
      context.path.push('items');
      if (obj.items.$ref && typeof obj.items.$ref !== 'string') {
        detectSchemaRefCycles(obj.items.$ref, schemas, context);
      }
      context.path.pop();
    }

    // Check map values (additionalProperties)
    if (obj.additionalProperties) {
      context.path.push('additionalProperties');
      checkPossibleRef(obj.additionalProperties, 'value');
      context.path.pop();
    }

    context.path.pop();
  }

  // Check all properties with $refs
  for (const prop of schema.properties) {
    checkPossibleRef(prop, prop.name);
  }

  // Check additionalProperties (map values) if present
  if (schema.additionalProperties) {
    checkPossibleRef(schema.additionalProperties, 'additionalProperties');
  }

  // Remove from current path stack
  context.stack.delete(schemaName);
  context.path.pop();

  // Mark as fully visited
  context.visited.add(schemaName);
}

class V1SchemaNormalizer {
  version = 'v1'
  exports: Export[] = []
  imports: Import[] = []
  schemas: SchemaMap = {}
  parsed: parser.V1Schema
  errors: ValidationError[]
  warnings: ValidationError[]

  constructor(parsed: parser.V1Schema) {
    this.parsed = parsed
    this.errors = parsed.errors
    this.warnings = parsed.warnings
  }

  normalize(): XtpSchema {
    // First let's create all our normalized schemas
    if (this.parsed.components?.schemas) {
      for (const name in this.parsed.components.schemas) {
        const pSchema = this.parsed.components.schemas[name];

        // turn any parser.Property map we have into Property[]
        const properties = []
        if (pSchema.properties) {
          for (const name in pSchema.properties) {
            // set `required` on the property for convenience
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
    }

    // recursively annotate all typed interfaces in the document
    this.annotateType(this.parsed as any)

    // detect cycles in schema references
    const cycleContext: CycleDetectionContext = {
      visited: new Set(),
      stack: new Set(),
      errors: [],
      path: ['#', 'components', 'schemas'],
    }

    for (const schema of Object.values(this.schemas)) {
      detectSchemaRefCycles(schema, this.schemas, cycleContext);
    }

    this.errors.push(...cycleContext.errors);

    // normalize exports
    if (this.parsed.exports) {

      for (const name in this.parsed.exports) {
        const ex = this.parsed.exports[name] as Export
        ex.name = name
        this.exports.push(ex)
      }
    }

    // normalize imports
    if (this.parsed.imports) {
      for (const name in this.parsed.imports) {
        const im = this.parsed.imports[name] as Import
        im.name = name
        this.imports.push(im)
      }
    }

    return {
      version: 'v1',
      exports: this.exports,
      imports: this.imports,
      schemas: this.schemas,
      errors: this.errors,
      warnings: this.warnings,
    }
  }

  // NOTE: we may want to relax this again so we can keep normalizing
  // even if a ref is invalid
  querySchemaRef(ref: string): Schema {
    const parts = ref.split('/')
    const name = parts[3]
    return this.schemas[name]!
  }

  annotateType(s: any): XtpNormalizedType | undefined {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return undefined
    if (s.xtpType) return s.xtpType

    // This pattern should be validated in the parser
    if (s.type && s.type === 'object' && s.additionalProperties) {
      s.type = 'map'
      const valueType = this.annotateType(s.additionalProperties)
      return valueType ? new MapType(valueType, s) : undefined
    }

    // if we have properties, we should be able to assume it's an object
    if (s.properties && s.properties.length > 0) {
      s.type = 'object'
      const properties: XtpNormalizedType[] = []
      for (const pname in s.properties) {
        const p = s.properties[pname]
        const t = this.annotateType(p)
        if (t) {
          p.xtpType = t
          properties.push(t)
        }
      }
      return new ObjectType(s.name!, properties, s)
    }

    if (s.$ref) {
      // don't recurse if the type is known
      if (s.type) {
        return undefined
      }

      // we're ovewriting this string $ref with the link to the
      // node that we find via query it may or may not have
      // been overwritten already
      if (typeof s.$ref === 'string') {
        s.$ref = this.querySchemaRef(s.$ref)
      }

      s.type = 'object'
      let obj = this.annotateType(s.$ref)
      if (obj && s.nullable) {
        obj = {...obj}
        obj.nullable = s.nullable
      }
      return obj
    }

    if (s.enum) {
      s.type = 'enum'
      return new EnumType(s.name || '', new StringType(), s.enum, s)
    }

    if (s.items) {
      const itemType = this.annotateType(s.items)
      return itemType ? new ArrayType(itemType, s) : undefined
    }

    switch (s.type) {
      case 'string':
        return s.format === 'date-time' ? new DateTimeType(s) : new StringType(s)
      case 'integer':
        if (s.format === 'uint8') return new UInt8Type(s)
        if (s.format === 'int8') return new Int8Type(s)
        if (s.format === 'uint16') return new UInt16Type(s)
        if (s.format === 'int16') return new Int16Type(s)
        if (s.format === 'uint32') return new UInt32Type(s)
        if (s.format === 'int32') return new Int32Type(s)
        if (s.format === 'uint64') return new UInt64Type(s)
        // default to int64
        return new Int64Type(s)
      case 'boolean':
        return new BooleanType(s)
      case 'buffer':
        return new BufferType(s)
      case 'number':
        if (s.format === 'float') return new FloatType(s)
        // default to double
        return new DoubleType(s)
      case 'object':
        return new FreeFormObjectType(s)
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
    return undefined
  }
}

function normalizeV1Schema(parsed: parser.V1Schema): XtpSchema {
  const normalizer = new V1SchemaNormalizer(parsed)
  const schema = normalizer.normalize()
  return schema
}

export function parseAndNormalizeJson(encoded: string): XtpSchema {
  const doc = parser.parseAny(JSON.parse(encoded))
  assert(doc)

  if (parser.isV0Schema(doc)) {
    return assert(normalizeV0Schema(doc))
  } else if (parser.isV1Schema(doc)) {
    return assert(normalizeV1Schema(doc))
  } else {
    throw new NormalizeError("Could not normalize unknown version of schema", [{
      message: "Could not normalize unknown version of schema",
      path: '#/version',
    }])
  }
}

function assert(results: parser.ParseResults): any {
  const { errors } = results
  if (errors && errors.length > 0) {
    if (errors.length === 1) {
      throw new NormalizeError(errors[0].message, errors)
    } else {
      throw new NormalizeError(`${errors[0].message} (and ${errors.length - 1} other error(s))`, errors)
    }
  }
  return results
}

export class NormalizeError extends Error {
  constructor(msg: string, public errors: ValidationError[]) {
    super(msg)
  }
}
