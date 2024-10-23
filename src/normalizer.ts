import { ValidationError } from "./common";
import * as parser from "./parser"

export interface XtpItemType extends Omit<parser.XtpItemType, '$ref'> {
  '$ref': Schema | null;
}

export interface Property extends Omit<parser.Property, '$ref' | 'additionalProperties'> {
  '$ref': Schema | null;
  nullable: boolean;
  items?: XtpItemType;
  name: string;
  additionalProperties?: AdditionalProperties;
}

export interface AdditionalProperties extends Omit<Property, 'description' | 'additionalProperties'> {

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

export interface Parameter extends Omit<parser.Parameter, '$ref' | 'additionalProperties'> {
  '$ref': Schema | null;
  additionalProperties?: AdditionalProperties;
}

export interface Export {
  name: string;
  description?: string;
  codeSamples?: parser.CodeSample[];
  input?: Parameter;
  output?: Parameter;
}

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

function querySchemaRef(schemas: { [key: string]: Schema }, ref: string, location: string): Schema {
  const parts = ref.split('/')
  if (parts[0] !== '#') throw new ValidationError("Not a valid ref " + ref, location);
  if (parts[1] !== 'components') throw new ValidationError("Not a valid ref " + ref, location);
  if (parts[2] !== 'schemas') throw new ValidationError("Not a valid ref " + ref, location);
  const name = parts[3];

  const s = schemas[name]
  if (!s) {
    const availableSchemas = Object.keys(schemas).join(', ')
    throw new ValidationError(`invalid reference ${ref}. Cannot find schema ${name}. Options are: ${availableSchemas}`, location);
  }
  return s
}

function normalizeProp(p: Parameter | Property | XtpItemType | parser.XtpItemType, s: Schema) {
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
  const validTypes = ['string', 'number', 'integer', 'boolean', 'object', 'array', 'buffer'];
  if (!validTypes.includes(type)) {
    throw new ValidationError(`Invalid type '${type}'. Options are: ${validTypes.map(t => `'${t}'`).join(', ')}`, location);
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

function normalizeMapProperty(schemas: SchemaMap, p: parser.Property, relativePath: string) {
  const path = `${relativePath}/additionalProperties`
  if (p.additionalProperties?.$ref) {
    normalizeProp(
      p.additionalProperties!,
      querySchemaRef(schemas, p.additionalProperties!.$ref, path)
    )

    p.additionalProperties.type = 'object';
  } else if (p.additionalProperties?.items) {
    if (p.additionalProperties.items.$ref) {
      normalizeProp(
        p.additionalProperties.items,
        querySchemaRef(schemas, p.additionalProperties.items.$ref, `${path}/items`)
      )
    }

    p.additionalProperties.type = 'array';
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
    if (s.enum) {
      schemas[name] = {
        ...s,
        name,
        properties: [],
        type: 'enum',
      }
    } else {
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
        type: 'object',
      }
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
        normalizeProp(
          schemas[name].properties[idx],
          querySchemaRef(schemas, rawProp.$ref, propPath)
        )
      }

      if (rawProp.items?.$ref) {
        const path = `${propPath}/items`

        normalizeProp(
          p.items!,
          querySchemaRef(schemas, rawProp.items!.$ref, path)
        )
      }

      normalizeMapProperty(
        schemas,
        rawProp,
        propPath
      )

      validateTypeAndFormat(p.type, p.format, propPath);
      validateArrayItems(p.items, `${propPath}/items`);

      // coerce to false by default
      p.nullable = p.nullable || false
    })
  }

  // denormalize all the exports
  for (const name in parsed.exports) {
    let ex = parsed.exports[name]

    const normEx = ex as Export
    normEx.name = name

    if (ex.input?.$ref) {
      const path = `#/exports/${name}/input`

      normalizeProp(
        normEx.input!,
        querySchemaRef(schemas, ex.input.$ref, path)
      )
    }
    if (ex.input?.items?.$ref) {
      const path = `#/exports/${name}/input/items`

      normalizeProp(
        normEx.input!.items!,
        querySchemaRef(schemas, ex.input.items.$ref, path)
      )
    }
    if (ex.input?.additionalProperties) {
      normalizeMapProperty(schemas, ex.input, `#/exports/${name}/input`);
    }

    if (ex.output?.$ref) {
      const path = `#/exports/${name}/output`

      normalizeProp(
        normEx.output!,
        querySchemaRef(schemas, ex.output.$ref, path)
      )
    }
    if (ex.output?.items?.$ref) {
      const path = `#/exports/${name}/output/items`

      normalizeProp(
        normEx.output!.items!,
        querySchemaRef(schemas, ex.output.items.$ref, path)
      )
    }
    if (ex.output?.additionalProperties) {
      normalizeMapProperty(schemas, ex.output, `#/exports/${name}/output`);
    }

    validateArrayItems(normEx.input?.items, `#/exports/${name}/input/items`);
    validateArrayItems(normEx.output?.items, `#/exports/${name}/output/items`);

    exports.push(normEx)
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

      normalizeProp(
        normIm.input!,
        querySchemaRef(schemas, im.input.$ref, path)
      )
    }
    if (im.input?.items?.$ref) {
      const path = `#/imports/${name}/input/items`

      normalizeProp(
        normIm.input!.items!,
        querySchemaRef(schemas, im.input.items.$ref, path)
      )
    }
    if (im.input?.additionalProperties) {
      normalizeMapProperty(schemas, im.input, `#/imports/${name}/input`);
    }

    if (im.output?.$ref) {
      const path = `#/imports/${name}/output`

      normalizeProp(
        normIm.output!,
        querySchemaRef(schemas, im.output.$ref, path)
      )
    }
    if (im.output?.items?.$ref) {
      const path = `#/imports/${name}/output/items`

      normalizeProp(
        normIm.output!.items!,
        querySchemaRef(schemas, im.output.items.$ref, path)
      )
    }
    if (im.output?.additionalProperties) {
      normalizeMapProperty(schemas, im.output, `#/imports/${name}/output`);
    }

    validateArrayItems(normIm.input?.items, `#/imports/${name}/input/items`);
    validateArrayItems(normIm.output?.items, `#/imports/${name}/output/items`);

    imports.push(normIm)
  }

  for (const name in schemas) {
    const schema = schemas[name]
    const error = detectCircularReference(schema);
    if (error) {
      throw error;
    }
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

function detectCircularReference(schema: Schema, visited: Set<string> = new Set()): ValidationError | null {
  if (visited.has(schema.name)) {
    return new ValidationError("Circular reference detected", `#/components/schemas/${schema.name}`);
  }

  visited.add(schema.name);

  for (const property of schema.properties) {
    if (property.$ref) {
      const error = detectCircularReference(property.$ref, new Set(visited));
      if (error) {
        return error;
      }
    } else if (property.items?.$ref) {
      const error = detectCircularReference(property.items.$ref, new Set(visited));
      if (error) {
        return error;
      }
    }
  }

  return null;
}