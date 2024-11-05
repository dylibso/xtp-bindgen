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

function normalizeV0Schema(parsed: parser.V0Schema): { schema: XtpSchema, errors: ValidationError[] } {
  const exports: Export[] = []
  const imports: Import[] = []
  const schemas = {}

  parsed.exports.forEach(ex => {
    exports.push({
      name: ex,
    })
  })

  return {
    schema: {
      version: 'v0',
      exports,
      imports,
      schemas,
    },
    errors: []
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
  errors: ValidationError[] = []
  location: string[] = ['#']

  constructor(parsed: parser.V1Schema) {
    this.parsed = parsed
  }

  private recordError(msg: string) {
    this.errors.push(
      new ValidationError(msg, this.location.join('/'))
    )
  }

  normalize(): XtpSchema {
    // First let's create all our normalized schemas
    if (this.parsed.components?.schemas) {
      this.location.push('components');
      this.location.push('schemas');

      for (const name in this.parsed.components.schemas) {
        this.location.push(name);
        const pSchema = this.parsed.components.schemas[name];

        // validate that required properties are defined
        if (pSchema.required) {
          this.location.push('required');
          for (const name of pSchema.required) {
            if (!pSchema.properties?.[name]) {
              this.recordError(`Property ${name} is required but not defined`);
            }
          }
          this.location.pop();
        }

        // turn any parser.Property map we have into Property[]
        const properties = []
        if (pSchema.properties) {
          this.location.push('properties');
          for (const name in pSchema.properties) {
            this.location.push(name);
            const required = pSchema.required?.includes(name)
            properties.push({ ...pSchema.properties[name], name, required } as Property)
            this.location.pop();
          }
          this.location.pop();
        }

        // we hard cast instead of copy we we can mutate the $refs later
        // TODO find a way around this
        const schema = (pSchema as unknown) as Schema
        schema.name = name
        schema.properties = properties
        this.schemas[name] = schema

        this.location.pop();
      }

      this.location.pop();
      this.location.pop();
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
      this.location.push('exports');
      for (const name in this.parsed.exports) {
        this.location.push(name);
        const ex = this.parsed.exports[name] as Export
        ex.name = name
        this.exports.push(ex)
        this.location.pop();
      }
      this.location.pop();
    }

    // normalize imports
    if (this.parsed.imports) {
      this.location.push('imports');
      for (const name in this.parsed.imports) {
        this.location.push(name);
        const im = this.parsed.imports[name] as Import
        im.name = name
        this.imports.push(im)
        this.location.pop();
      }
      this.location.pop();
    }

    return {
      version: 'v1',
      exports: this.exports,
      imports: this.imports,
      schemas: this.schemas,
    }
  }

  querySchemaRef(ref: string): Schema | null {
    const parts = ref.split('/')
    if (parts[0] !== '#' || parts[1] !== 'components' || parts[2] !== 'schemas') {
      this.recordError("Not a valid ref " + ref);
      return null;
    }

    const name = parts[3];
    const s = this.schemas[name]
    if (!s) {
      const availableSchemas = Object.keys(this.schemas).join(', ')
      this.recordError(`Invalid reference ${ref}. Cannot find schema ${name}. Options are: [${availableSchemas}]`);
      return null;
    }

    return s
  }

  annotateType(s: any): XtpNormalizedType | undefined {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return undefined
    if (s.xtpType) return s.xtpType

    if ((s.type && s.type === 'object') ||
      (s.properties && s.properties.length > 0)) {

      s.type = 'object'
      
      const properties: XtpNormalizedType[] = []
      if (s.properties) {
        this.location.push('properties');
        for (const pname in s.properties) {
          const p = s.properties[pname]
          this.location.push(p.name ?? pname);
          const t = this.annotateType(p)
          if (t) {
            p.xtpType = t
            properties.push(t)
          }
          this.location.pop();
        }
        this.location.pop();
        return new ObjectType(s.name || '', properties, s)
      } else {
        // untyped object
        return new ObjectType('', [], s)
      }
    }

    if (s.$ref) {
      this.location.push('$ref');
      let ref = s.$ref
      if (typeof s.$ref === 'string') {
        ref = this.querySchemaRef(s.$ref)
        if (ref) {
          s.$ref = ref
        }
      }

      s.type = 'object'
      const result = ref ? this.annotateType(ref) : undefined;
      this.location.pop();
      return result;
    }

    if (s.enum) {
      s.type = 'enum'
      return new EnumType(s.name || '', new StringType(), s.enum, s)
    }

    if (s.items) {
      this.location.push('items');
      const itemType = this.annotateType(s.items)
      this.location.pop();
      return itemType ? new ArrayType(itemType, s) : undefined
    }

    if (s.additionalProperties) {
      this.location.push('additionalProperties');
      s.type = 'map'
      const valueType = this.annotateType(s.additionalProperties)
      this.location.pop();
      return valueType ? new MapType(valueType, s) : undefined
    }

    switch (s.type) {
      case 'string':
        return s.format === 'date-time' ? new DateTimeType(s) : new StringType(s)
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
        this.recordError(`IDK how to parse this number: ${s.format}`);
        return undefined
    }

    // if we get this far, we don't know what
    // this node is let's just keep drilling down
    for (const key in s) {
      if (Object.prototype.hasOwnProperty.call(s, key)) {
        const child = s[key]
        if (child && typeof child === 'object' && !Array.isArray(child)) {
          this.location.push(key);
          const t = this.annotateType(child);
          if (t) child.xtpType = t
          this.location.pop();
        }
      }
    }
    return undefined
  }
}

function normalizeV1Schema(parsed: parser.V1Schema): { schema: XtpSchema, errors: ValidationError[] } {
  const normalizer = new V1SchemaNormalizer(parsed)
  const schema = normalizer.normalize()
  return { schema, errors: normalizer.errors }
}

export function parseAndNormalizeJson(encoded: string): XtpSchema {
  const { doc, errors } = parser.parseAny(JSON.parse(encoded))
  assert(errors)

  if (parser.isV0Schema(doc)) {
    const { schema, errors } = normalizeV0Schema(doc)
    assert(errors)

    return schema
  } else if (parser.isV1Schema(doc)) {
    const { schema, errors } = normalizeV1Schema(doc)
    assert(errors)

    return schema
  } else {
    throw new NormalizeError("Could not normalize unknown version of schema", [{
      message: "Could not normalize unknown version of schema",
      path: '#/version',
    }])
  }
}

function assert(errors: ValidationError[] | undefined): void {
  if (errors && errors.length > 0) {
    if (errors.length === 1) {
      throw new NormalizeError(errors[0].message, errors)
    } else {
      throw new NormalizeError(`${errors[0].message} (and ${errors.length - 1} other error(s))`, errors)
    }
  }
}

export class NormalizeError extends Error {
  constructor(msg: string, public errors: ValidationError[]) {
    super(msg)
  }
}