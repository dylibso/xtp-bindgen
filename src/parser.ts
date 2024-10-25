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
    this.validateNode(this.doc)
    return this.errors
  }

  /**
   * Recursively walk through the untyped document and validate each node.
   * This saves us a lot of code but might be a little bit slower.
   */
  validateNode(node: any) {
    this.validateTypedInterface(node)
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

  recordError(msg: string) {
    this.errors.push(
      new ValidationError(msg, this.getLocation())
    )
  }

  /**
   * Validates that a node conforms to the rules of
   * the XtpTyped interface. Validates what we can't
   * catch in JSON Schema validation.
   */
  validateTypedInterface(prop?: XtpTyped): void {
    if (!prop || !prop.type) return

    const validTypes = ['string', 'number', 'integer', 'boolean', 'object', 'array', 'buffer'];
    if (!validTypes.includes(prop.type)) {
      this.recordError(`Invalid type '${prop.type}'. Options are: ${validTypes.map(t => `'${t}'`).join(', ')}`)
    }

    if (!prop.format) {
      return;
    }

    let validFormats: XtpFormat[] = [];
    if (prop.type === 'string') {
      validFormats = ['date-time', 'byte'];
    } else if (prop.type === 'number') {
      validFormats = ['float', 'double'];
    } else if (prop.type === 'integer') {
      validFormats = ['int32', 'int64'];
    }

    if (!validFormats.includes(prop.format)) {
      this.recordError(`Invalid format ${prop.format} for type ${prop.type}. Valid formats are: ${validFormats.join(', ')}`)
    }

    if (prop.items) this.validateTypedInterface(prop.items)
    if (prop.additionalProperties) this.validateTypedInterface(prop.additionalProperties)
  }

  getLocation(): string {
    return this.location.join('/')
  }
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

// These are the only types we're interested in discriminating
export type NodeKind = 'schema' | 'property' | 'parameter' | 'import' | 'export'

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

