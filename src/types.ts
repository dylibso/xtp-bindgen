/**
 * These represent the types in our abstract type system.
 * We will normalize the raw XTP schema into these recursively defined types.
 */

export type XtpNormalizedKind =
  'object' | 'enum' | 'map' | 'array' | 'string' |
  'int32' | 'int64' | 'float' | 'double' |
  'boolean' | 'date-time' | 'byte' | 'buffer' |
  'jsobject'


// applies type opts to a type on construction
function cons(t: XtpNormalizedType, opts?: XtpTypeOpts): XtpNormalizedType {
  // default them to false
  t.nullable = (opts?.nullable === undefined) ? false : opts.nullable
  return t
}

export interface XtpTypeOpts {
  nullable?: boolean;
}

export interface XtpNormalizedType extends XtpTypeOpts {
  kind: XtpNormalizedKind;
}

export class StringType implements XtpNormalizedType {
  kind: XtpNormalizedKind = 'string';
  constructor(opts?: XtpTypeOpts) {
    cons(this, opts)
  }
}

export class Int32Type implements XtpNormalizedType {
  kind: XtpNormalizedKind = 'int32';
  constructor(opts?: XtpTypeOpts) {
    cons(this, opts)
  }
}

export class Int64Type implements XtpNormalizedType {
  kind: XtpNormalizedKind = 'int64';
  constructor(opts?: XtpTypeOpts) {
    cons(this, opts)
  }
}

export class FloatType implements XtpNormalizedType {
  kind: XtpNormalizedKind = 'float';
  constructor(opts?: XtpTypeOpts) {
    cons(this, opts)
  }
}

export class DoubleType implements XtpNormalizedType {
  kind: XtpNormalizedKind = 'double';
  constructor(opts?: XtpTypeOpts) {
    cons(this, opts)
  }
}

export class BooleanType implements XtpNormalizedType {
  kind: XtpNormalizedKind = 'boolean';
  constructor(opts?: XtpTypeOpts) {
    cons(this, opts)
  }
}

export class ByteType implements XtpNormalizedType {
  kind: XtpNormalizedKind = 'byte';
  constructor(opts?: XtpTypeOpts) {
    cons(this, opts)
  }
}

export class BufferType implements XtpNormalizedType {
  kind: XtpNormalizedKind = 'buffer';
  constructor(opts?: XtpTypeOpts) {
    cons(this, opts)
  }
}

export class DateTimeType implements XtpNormalizedType {
  kind: XtpNormalizedKind = 'date-time';
  constructor(opts?: XtpTypeOpts) {
    cons(this, opts)
  }
}

export class ObjectType implements XtpNormalizedType {
  kind: XtpNormalizedKind = 'object';
  name: string;
  properties: Array<XtpNormalizedType>;

  constructor(name: string, properties: Array<XtpNormalizedType>, opts?: XtpTypeOpts) {
    this.name = name
    this.properties = properties
    cons(this, opts)
  }
}

export class FreeFormObjectType implements XtpNormalizedType {
  kind: XtpNormalizedKind = 'jsobject';

  constructor(opts?: XtpTypeOpts) {
    cons(this, opts)
  }
}

export class MapType implements XtpNormalizedType {
  kind: XtpNormalizedKind = 'map';
  keyType = new StringType(); // strings only for now
  valueType: XtpNormalizedType;

  constructor(valueType: XtpNormalizedType, opts?: XtpTypeOpts) {
    this.valueType = valueType
    cons(this, opts)
  }
}

export class EnumType implements XtpNormalizedType {
  kind: XtpNormalizedKind = 'enum';
  name: string;
  elementType: XtpNormalizedType;
  values: any[];

  constructor(name: string, elementType: XtpNormalizedType, values: any[], opts?: XtpTypeOpts) {
    this.name = name
    this.elementType = elementType
    this.values = values
    cons(this, opts)
  }
}

export class ArrayType implements XtpNormalizedType {
  kind: XtpNormalizedKind = 'array';
  elementType: XtpNormalizedType;

  constructor(elementType: XtpNormalizedType, opts?: XtpTypeOpts) {
    this.elementType = elementType
    cons(this, opts)
  }
}

