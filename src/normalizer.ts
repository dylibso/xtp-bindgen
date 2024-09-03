import { ValidationError } from "./common";
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
  if (parts[0] !== '#') throw new ValidationError("Not a valid ref " + ref, location);
  if (parts[1] !== 'components') throw new ValidationError("Not a valid ref " + ref, location);
  if (parts[2] !== 'schemas') throw new ValidationError("Not a valid ref " + ref, location);
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
    throw new ValidationError(`Invalid type ${type}`, location);
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
    throw new ValidationError(`Invalid format ${format} for type ${type}. Valid formats are: ${validFormats.join(', ')}`, location);
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
      const propPath = `#/components/schemas/${name}/properties/${p.name}`;

      if (rawProp.$ref) {
        const schema = schemas[parseSchemaRef(rawProp.$ref, propPath)]
        if (!schema) {
          throw new ValidationError("invalid reference " + rawProp.$ref, propPath);
        }

        normalizeProp(
          schemas[name].properties[idx],
          schema,
          propPath
        )
      }

      if (rawProp.items?.$ref) {
        const path = `${propPath}/items`
        const schema = schemas[parseSchemaRef(rawProp.items!.$ref, `${propPath}/items`)]
        if (!schema) {
          throw new ValidationError("invalid reference " + rawProp.items!.$ref, path);
        }

        normalizeProp(
          p.items!,
          schema,
          path
        )
      }

      validateTypeAndFormat(p.type, p.format, propPath);
      validateArrayItems(p.items, `${propPath}/items`);

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
        const path = `#/exports/${name}/input`
        const schema = schemas[parseSchemaRef(ex.input.$ref, path)]
        if (!schema) {
          throw new ValidationError("invalid reference " + ex.input.$ref, path);
        }

        normalizeProp(
          normEx.input!,
          schema,
          path
        )
      }
      if (ex.input?.items?.$ref) {
        const path = `#/exports/${name}/input/items`
        const schema = schemas[parseSchemaRef(ex.input.items.$ref, path)]
        if (!schema) {
          throw new ValidationError("invalid reference " + ex.input.items.$ref, path);
        }

        normalizeProp(
          normEx.input!.items!,
          schema,
          path
        )
      }

      if (ex.output?.$ref) {
        const path = `#/exports/${name}/output`
        const schema = schemas[parseSchemaRef(ex.output.$ref, path)]
        if (!schema) {
          throw new ValidationError("invalid reference " + ex.output.$ref, path);
        }

        normalizeProp(
          normEx.output!,
          schema,
          path
        )
      }
      if (ex.output?.items?.$ref) {
        const path = `#/exports/${name}/output/items`
        const schema = schemas[parseSchemaRef(ex.output.items.$ref, path)]
        if (!schema) {
          throw new ValidationError("invalid reference " + ex.output.items.$ref, path);
        }

        normalizeProp(
          normEx.output!.items!,
          schema,
          path
        )
      }

      validateArrayItems(normEx.input?.items, `#/exports/${name}/input/items`);
      validateArrayItems(normEx.output?.items, `#/exports/${name}/output/items`);

      exports.push(normEx)
    } else if (parser.isSimpleExport(ex)) {
      // it's just a name
      exports.push({ name })
    } else {
      throw new ValidationError("Unable to match export to a simple or a complex export", `#/exports/${name}`);
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
      const path = `#/imports/${name}/input`
      const schema = schemas[parseSchemaRef(im.input.$ref, path)]
      if (!schema) {
        throw new ValidationError("invalid reference " + im.input.$ref, path);
      }

      normalizeProp(
        normIm.input!,
        schema,
        path
      )
    }
    if (im.input?.items?.$ref) {
      const path = `#/imports/${name}/input/items`
      const schema = schemas[parseSchemaRef(im.input.items.$ref, path)]
      if (!schema) {
        throw new ValidationError("invalid reference " + im.input.items.$ref, path);
      }

      normalizeProp(
        normIm.input!.items!,
        schema,
        path
      )
    }

    if (im.output?.$ref) {
      const path = `#/imports/${name}/output`
      const schema = schemas[parseSchemaRef(im.output.$ref, path)]
      if (!schema) {
        throw new ValidationError("invalid reference " + im.output.$ref, path);
      }

      normalizeProp(
        normIm.output!,
        schema,
        path
      )
    }
    if (im.output?.items?.$ref) {
      const path = `#/imports/${name}/output/items`
      const schema = schemas[parseSchemaRef(im.output.items.$ref, path)]
      if (!schema) {
        throw new ValidationError("invalid reference " + im.output.items.$ref, path);
      }

      normalizeProp(
        normIm.output!.items!,
        schema,
        path
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
    throw new ValidationError("Could not normalize unknown version of schema", "#");
  }
}

function detectCircularReference(schema: Schema, visited: Set<Schema> = new Set()): ValidationError | null {
  if (visited.has(schema)) {
    return new ValidationError("Circular reference detected", `#/schemas/${schema.name}`);
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

export function validateSchema(schema: XtpSchema): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check for circular references
  for (const schemaName in schema.schemas) {
    const error = detectCircularReference(schema.schemas[schemaName]);
    if (error) {
      errors.push(error);
    }
  }

  return errors;
}