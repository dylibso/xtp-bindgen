/**
 * The parser is responsible for taking a raw JS object
 * of the XTP Schema and parsing and typing it without transforming
 * any of the values. It's just mean to give a typed representation
 * of the raw format.
 */
import { ValidationError } from "./common"

export interface ParseResult {
  doc?: VUnknownSchema;
  errors?: ValidationError[];
  warnings?: ValidationError[];
}

/**
 * Parses and validates an untyped object into a V*Schema
 */
export function parseAny(doc: any): ParseResult {
  switch (doc.version) {
    case 'v0':
      return { doc: doc as V0Schema }
    case 'v1-draft':
      const v1Doc = doc as V1Schema
      const validator = new V1Validator(v1Doc)
      const errors = validator.validate()
      return { doc: v1Doc, errors }
    default:
      return {
        errors: [
          new ValidationError(`version property not valid: ${doc.version}`, "#/version")
        ]
      }
  }
}

export function isV0Schema(schema?: VUnknownSchema): schema is V0Schema {
  return schema?.version === 'v0';
}

export function isV1Schema(schema?: VUnknownSchema): schema is V1Schema {
  return schema?.version === 'v1-draft';
}

/**
 * Validates a V1 document.
 */
class V1Validator {
  errors: ValidationError[]
  location: string[]
  doc: any

  constructor(doc: V1Schema) {
    this.doc = doc as any
    this.errors = []
    this.location = ['#']
  }

  /**
   * Validate the document and return any errors
   */
  validate(): ValidationError[] {
    this.errors = []
    this.validateRootNames()
    this.validateNode(this.doc)
    return this.errors
  }

  /**
   * Recursively walk through the untyped document and validate each node.
   * This saves us a lot of code but might be a little bit slower.
   */
  validateNode(node: any) {
    const currentPath = this.getLocation()

    // we want to skip validateTypedInterface for some paths
    // that represent user-defined maps (i.e the keys are defined by the user)
    const skipPatterns = [
      /^#\/components\/schemas\/[^/]+\/properties$/, // allow defining properties named `type` or `format`
      /^#\/components\/schemas$/, // allow defining schemas named `type` or `format`
      /^#\/components$/, // reserved for future use
      /^#\/exports$/, // allow defining exports named `type` or `format`
      /^#\/imports$/ // allow defining imports named `type` or `format`
    ]

    const shouldValidate = skipPatterns.none(pattern => pattern.test(currentPath))
    if (shouldValidate) {
      this.validateTypedInterface(node)
    }

    if (node && typeof node === 'object') {
      // i don't think we need to validate array children
      if (Array.isArray(node)) return

      for (const key in node) {
        if (Object.prototype.hasOwnProperty.call(node, key)) {
          const child = node[key]
          if (typeof child === 'object') {
            this.location.push(key)
            this.validateNode(child);
            this.location.pop()
          }
        }
      }
    }
  }

  /**
   * Validates the root names of the doc.
   * We just do this by hand as it's tricky to do recursively
   */
  validateRootNames() {
    const exports = this.doc.exports || {}
    for (const n in exports) {
      this.validateIdentifier(n, ['exports', n])
    }
    const imports = this.doc.imports || {}
    for (const n in imports) {
      this.validateIdentifier(n, ['imports', n])
    }
    const schemas = this.doc.components?.schemas || {}
    for (const n in schemas) {
      this.validateIdentifier(n, ['components', 'schemas', n])
    }
  }

  recordError(msg: string, suffix?: Array<string>) {
    const path = this.getLocation(suffix)
    this.errors.push(
      new ValidationError(msg, path)
    )
  }

  /**
   * Validates that a node conforms to the rules of
   * the XtpTyped interface. These validations catch a lot of
   * what we can't catch in JSON Schema validation.
   */
  validateTypedInterface(prop?: XtpTyped): void {
    if (!prop) return

    const validTypes = ['string', 'number', 'integer', 'boolean', 'object', 'array', 'buffer'];
    if (prop.type && !validTypes.includes(prop.type)) {
      this.recordError(`Invalid type '${stringify(prop.type)}'. Options are: [${validTypes.map(t => `'${t}'`).join(', ')}]`)
    }

    if (prop.format) {
      let validFormats: XtpFormat[] = [];
      if (prop.type === 'string') {
        validFormats = ['date-time', 'byte'];
      } else if (prop.type === 'number') {
        validFormats = ['float', 'double'];
      } else if (prop.type === 'integer') {
        validFormats = ['int32', 'int64'];
      }

      if (!validFormats.includes(prop.format)) {
        this.recordError(`Invalid format ${stringify(prop.format)} for type ${stringify(prop.type)}. Valid formats are: [${validFormats.join(', ')}]`)
      }
    }

    // TODO consider adding properties to XtpTyped when we support inlining objects
    // for now we'll use the presence of `properties` as a hint to cast to Schema
    if ('properties' in prop && Object.keys(prop.properties!).length > 0) {
      const schema = prop as Schema
      // check for mixing of additional and fixed props
      if (schema.additionalProperties) {
        this.recordError('We currently do not support objects with both fixed properties and additionalProperties')
      }

      // validate the required array
      if (schema.required) {
        for (const name of schema.required) {
          if (!schema.properties?.[name]) {
            this.recordError(`Property ${name} is marked as required but not defined`);
          }
        }
      }

      // validate the property names
      for (const name in schema.properties) {
        this.validateIdentifier(name, ['properties', name])
      }
    }

    // validate enum items if they exists
    if (prop.enum) {
      for (const item of prop.enum) {
        if (typeof item !== 'string') {
          this.recordError(`Enum item must be a string: ${item}`);
        }
        this.validateIdentifier(item, ['enum']);
      }
    }

    if (prop.items) this.validateTypedInterface(prop.items)
    if (prop.additionalProperties) this.validateTypedInterface(prop.additionalProperties)

    // if we have a $ref, validate it
    if (prop.$ref) {
      const parts = prop.$ref.split('/')
      // for now we can only link to schemas
      // TODO we should be able to link to any valid type in the future
      if (parts[0] === '#' && parts[1] === 'components' && parts[2] === 'schemas') {
        const name = parts[3]
        const schemas = this.doc.components?.schemas || {}
        const s = schemas[name]
        if (!s) {
          const availableSchemas = Object.keys(schemas).join(', ')
          this.recordError(`Invalid $ref "${prop.$ref}". Cannot find schema "${name}". Options are: [${availableSchemas}]`, ['$ref']);
        }
      } else {
        this.recordError(`Invalid $ref "${prop.$ref}"`, ['$ref'])
      }
    }
  }

  validateIdentifier(name: string, path?: string[]) {
    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) {
      this.recordError(`Invalid identifier: "${name}". Must match /^[a-zA-Z_$][a-zA-Z0-9_$]*$/`, path);
    }
  }

  getLocation(suffix: string[] = []): string {
    return this.location.concat(suffix).join('/')
  }
}


function stringify(typ: any): string {
  if (typeof typ === 'object') {
    return JSON.stringify(typ)
  }

  return `${typ}`
}


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

export interface Schema extends XtpTyped {
  description?: string;
  required?: string[];
  properties?: { [name: string]: Property };
}

// TODO this figure out how to split up type again?
//export type XtpSchemaType = 'object' | 'enum' | 'map'

export type XtpType =
  'integer' | 'string' | 'number' | 'boolean' | 'object' |
  'array' | 'buffer' | 'object' | 'enum' | 'map';
export type XtpFormat =
  'int32' | 'int64' | 'float' | 'double' | 'date-time' | 'byte';


// Shared interface for any place you can
// define some types inline. Ex: Schema, Property, Parameter
export interface XtpTyped {
  type?: XtpType;
  format?: XtpFormat;
  items?: XtpTyped;
  additionalProperties?: Property;
  nullable?: boolean;
  enum?: string[];
  name?: string;
  //properties?: { [name: string]: Property };

  // NOTE: needs to be any to satisfy type satisfy
  // type system in normalizer, but is in fact a string at this layer
  "$ref"?: any;
}

// A property is a named sub-property of an object
// It's a mostly type info
export interface Property extends XtpTyped {
  description?: string;
}

// The input and output of boundary functions are Parameters.
// It's a mostly a Property, but also has a required encoding.
export interface Parameter extends Property {
  contentType: MimeType;
}

