import { parse, helpers, MapType, ArrayType, NormalizeError, ValidationError, ObjectType } from '../src/index';
const { isBoolean, isObject, isString, isEnum, isDateTime, isInt32, isInt64, isMap } = helpers;
import * as yaml from 'js-yaml'
import * as fs from 'fs'

const validV1Doc: any = yaml.load(fs.readFileSync('./tests/schemas/v1-valid-doc.yaml', 'utf8'))

test('parse-v1-document', () => {
  const doc = parse(JSON.stringify(validV1Doc))

  //console.log(JSON.stringify(doc, null, 4))

  // check top level document is correct
  expect(doc.version).toBe('v1')
  expect(Object.keys(doc.schemas).length).toBe(5)
  expect(doc.exports.length).toBe(3)
  expect(doc.imports.length).toBe(1)

  const enumSchema1 = doc.schemas['Fruit']
  expect(enumSchema1.type).toBe('enum')
  expect(enumSchema1.enum).toStrictEqual(validV1Doc.components.schemas['Fruit'].enum)
  expect(enumSchema1.xtpType.kind).toBe('enum')

  const enumSchema2 = doc.schemas['GhostGang']
  expect(enumSchema2.type).toBe('enum')
  expect(enumSchema2.enum).toStrictEqual(validV1Doc.components.schemas['GhostGang'].enum)
  expect(enumSchema2.xtpType.kind).toBe('enum')

  const schema3 = doc.schemas['ComplexObject']
  expect(schema3.type).toBe('object')
  expect(schema3.xtpType.kind).toBe('object')
  const properties = schema3.properties

  expect(isObject(schema3)).toBe(true)
  expect(isEnum(properties[0])).toBe(true)
  expect(properties[0].required).toBe(true)
  expect(isBoolean(properties[1])).toBe(true)
  expect(properties[1].required).toBe(true)
  expect(isString(properties[2])).toBe(true)
  expect(properties[2].required).toBe(false)
  expect(isInt32(properties[3])).toBe(true)
  expect(properties[3].required).toBe(false)
  expect(isDateTime(properties[4])).toBe(true)
  expect(properties[4].required).toBe(false)
  expect(isMap(properties[5])).toBe(true)
  expect(properties[5].required).toBe(false)
  let mType = properties[5].xtpType as MapType
  expect(mType.keyType.kind).toBe('string')
  expect(mType.valueType.kind).toBe('string')
  expect(isInt64(properties[6])).toBe(true)
  expect(properties[6].required).toBe(false)
  // Map<string, Map<string, Array<Date | null>>
  expect(isMap(properties[7])).toBe(true)
  expect(properties[7].required).toBe(false)
  mType = properties[7].xtpType as MapType
  expect(mType.keyType.kind).toBe('string')
  expect(mType.valueType.kind).toBe('map')
  mType = mType.valueType as MapType
  expect(mType.keyType.kind).toBe('string')
  expect(mType.valueType.kind).toBe('array')
  let aType = mType.valueType as ArrayType
  expect(aType.kind).toBe('array')
  expect(aType.elementType.kind).toBe('date-time')
  expect(aType.elementType.nullable).toBe(true)

  // untyped object
  expect(isObject(properties[8])).toBe(true)
  expect((properties[8].xtpType as ObjectType).name).toBe("")

  // proves we derferenced it
  expect(properties[0].$ref?.enum).toStrictEqual(validV1Doc.components.schemas['GhostGang'].enum)
  expect(properties[0].$ref?.name).toBe('GhostGang')
  expect(properties[0].name).toBe('ghost')

  const mapSchema = doc.schemas['MapSchema']
  expect(mapSchema.type).toBe('map')
  expect(mapSchema.additionalProperties).toStrictEqual({ type: 'string' })

  const exp = doc.exports[2]
  // proves we derferenced it
  expect(exp.input?.$ref?.enum).toStrictEqual(validV1Doc.components.schemas['Fruit'].enum)
  expect(exp.output?.contentType).toBe('application/json')
})

test('parse-v1-invalid-document', () => {
  const invalidV1Doc: any = yaml.load(fs.readFileSync('./tests/schemas/v1-invalid-doc.yaml', 'utf8'))
  try {
    parse(JSON.stringify(invalidV1Doc))
    expect(true).toBe('should have thrown')
  } catch (e) {
    const expectedErrors = [
      new ValidationError(
        'Invalid format date-time for type buffer. Valid formats are: []',
        '#/exports/invalidFunc1/input'
      ),
      new ValidationError(
        'Invalid format float for type string. Valid formats are: [date-time, byte]',
        '#/exports/invalidFunc1/output'
      ),
      new ValidationError(
        'Invalid format date-time for type boolean. Valid formats are: []',
        '#/components/schemas/ComplexObject/properties/aBoolean'
      ),
      new ValidationError(
        'Invalid format int32 for type string. Valid formats are: [date-time, byte]',
        '#/components/schemas/ComplexObject/properties/aString'
      ),
      new ValidationError(
        'Invalid format date-time for type integer. Valid formats are: [int32, int64]',
        '#/components/schemas/ComplexObject/properties/anInt'
      ),
      new ValidationError(
        "Invalid type 'non'. Options are: ['string', 'number', 'integer', 'boolean', 'object', 'array', 'buffer']",
        '#/components/schemas/ComplexObject/properties/aNonType'
      ),
    ]

    expectErrors(e, expectedErrors)
  }
})

test('parse-v1-invalid-ref-document', () => {
  const invalidV1Doc: any = yaml.load(fs.readFileSync('./tests/schemas/v1-invalid-ref-doc.yaml', 'utf8'))
  try {
    parse(JSON.stringify(invalidV1Doc))
    expect(true).toBe('should have thrown')
  } catch (e) {
    const expectedErrors = [
      new ValidationError(
        'Property ghost is marked as required but not defined',
        '#/components/schemas/ComplexObject'
      ),
      new ValidationError(
        'Invalid $ref "#/components/schemas/NonExistentExportInputRef". Cannot find schema "NonExistentExportInputRef". Options are: [ComplexObject]',
        '#/exports/invalidFunc/input/$ref'
      ),
      new ValidationError(
        'Invalid $ref "#/components/schemas/NonExistentImportOutputRef". Cannot find schema "NonExistentImportOutputRef". Options are: [ComplexObject]',
        '#/imports/invalidImport/output/$ref'
      ),
      new ValidationError(
        'Invalid $ref "#/components/schemas/NonExistentPropertyRef". Cannot find schema "NonExistentPropertyRef". Options are: [ComplexObject]',
        '#/components/schemas/ComplexObject/properties/invalidPropRef/$ref'
      ),
      new ValidationError(
        'Invalid $ref "some invalid ref"',
        '#/exports/invalidFunc/output/$ref'
      ),
    ]

    expectErrors(e, expectedErrors)
  }
})

test('parse-v1-cycle-doc', () => {
  const cycleDoc: any = yaml.load(fs.readFileSync('./tests/schemas/v1-invalid-cycle-doc.yaml', 'utf8'))
  try {
    const schema = parse(JSON.stringify(cycleDoc))
    JSON.stringify(schema) // if we get here, this will throw
  } catch (e) {
    const expectedErrors = [
      {
        message: 'Detected circular reference: ComplexObject -> cycle -> AnotherType -> complexObject -> ComplexObject',
        path: '#/components/schemas/ComplexObject/cycle/AnotherType/complexObject'
      }
    ]

    expectErrors(e, expectedErrors)
  }
})

test('parse-v1-invalid-identifiers-doc', () => {
  const identifierDoc: any = yaml.load(fs.readFileSync('./tests/schemas/v1-invalid-identifier-doc.yaml', 'utf8'))

  try {
    parse(JSON.stringify(identifierDoc))
    expect(true).toBe('should have thrown')
  } catch (e) {
    const expectedErrors = [
      new ValidationError(
        'Invalid identifier: "Ghost)Gang". Must match /^[a-zA-Z_$][a-zA-Z0-9_$]*$/',
        '#/components/schemas/Ghost)Gang'
      ),
      new ValidationError(
        'Invalid identifier: "gh ost". Must match /^[a-zA-Z_$][a-zA-Z0-9_$]*$/',
        '#/components/schemas/ComplexObject/properties/gh ost'
      ),
      new ValidationError(
        'Invalid identifier: "aBoo{lean". Must match /^[a-zA-Z_$][a-zA-Z0-9_$]*$/',
        '#/components/schemas/ComplexObject/properties/aBoo{lean'
      ),
      new ValidationError(
        'Invalid identifier: "spooky ghost". Must match /^[a-zA-Z_$][a-zA-Z0-9_$]*$/',
        '#/components/schemas/Ghost)Gang/enum'
      ),
      new ValidationError(
        'Invalid identifier: "invalid@Func". Must match /^[a-zA-Z_$][a-zA-Z0-9_$]*$/',
        '#/exports/invalid@Func'
      ),
      new ValidationError(
        'Invalid identifier: "invalid invalid". Must match /^[a-zA-Z_$][a-zA-Z0-9_$]*$/',
        '#/exports/invalid invalid'
      ),
      new ValidationError(
        'Invalid identifier: "referenc/eTypeFunc". Must match /^[a-zA-Z_$][a-zA-Z0-9_$]*$/',
        '#/exports/referenc/eTypeFunc'
      ),
      new ValidationError(
        'Invalid identifier: "eatA:Fruit". Must match /^[a-zA-Z_$][a-zA-Z0-9_$]*$/',
        '#/imports/eatA:Fruit'
      ),
    ]

    expectErrors(e, expectedErrors)
  }
})

test('parse-v1-additional-props-doc', () => {
  const invalidV1Doc: any = yaml.load(fs.readFileSync('./tests/schemas/v1-invalid-additional-properties.yaml', 'utf8'))
  try {
    parse(JSON.stringify(invalidV1Doc))
    expect(true).toBe('should have thrown')
  } catch (e) {
    const expectedErrors = [
      {
        message: 'We currently do not support objects with both fixed properties and additionalProperties',
        path: '#/components/schemas/MixedObject'
      },
    ]

    expectErrors(e, expectedErrors)
  }
})

test('parse-v1-invalid-keyword-doc', () => {
  const invalidV1Doc: any = yaml.load(fs.readFileSync('./tests/schemas/v1-invalid-keyword-doc.yaml', 'utf8'))
  try {
    const doc = parse(JSON.stringify(invalidV1Doc))
    const expectedErrors = [
      new ValidationError(
        "Potentially Invalid identifier: \"Break\". This is a keyword in the following languages and may cause trouble with code generation: python,go,csharp,rust,cpp,zig",
        "#/components/schemas/Break",
      ),
      new ValidationError(
        "Potentially Invalid identifier: \"abstract\". This is a keyword in the following languages and may cause trouble with code generation: csharp,rust",
        "#/components/schemas/Break/properties/abstract",
      ),
      new ValidationError(
        "Potentially Invalid identifier: \"addrspace\". This is a keyword in the following languages and may cause trouble with code generation: zig",
        "#/components/schemas/Break/properties/addrspace",
      ),
      new ValidationError(
        "Potentially Invalid identifier: \"alignas\". This is a keyword in the following languages and may cause trouble with code generation: cpp",
        "#/components/schemas/Break/properties/alignas",
      ),
      new ValidationError(
        "Potentially Invalid identifier: \"and\". This is a keyword in the following languages and may cause trouble with code generation: python,cpp,zig",
        "#/components/schemas/Break/properties/and",
      ),
      new ValidationError(
        "Potentially Invalid identifier: \"as\". This is a keyword in the following languages and may cause trouble with code generation: python,csharp,rust",
        "#/components/schemas/Break/properties/as",
      ),
      new ValidationError(
        "Potentially Invalid identifier: \"interface\". This is a keyword in the following languages and may cause trouble with code generation: go,csharp",
        "#/components/schemas/Break/properties/interface",
      ),
      new ValidationError(
        "Potentially Invalid identifier: \"type\". This is a keyword in the following languages and may cause trouble with code generation: go,rust",
        "#/components/schemas/Break/properties/type",
      ),
      new ValidationError(
        "Potentially Invalid identifier: \"false\". This is a keyword in the following languages and may cause trouble with code generation: python,csharp,rust,cpp",
        "#/exports/false",
      ),
      new ValidationError(
        "Potentially Invalid identifier: \"true\". This is a keyword in the following languages and may cause trouble with code generation: python,csharp,rust,cpp",
        "#/imports/true",
      ),
    ]


    expectValidationErrors(doc.warnings, expectedErrors)
  } catch (e) {
    console.log(e)
    expect(true).toBe('should not have thrown')
  }
})

function expectValidationErrors(given: ValidationError[], expected: ValidationError[]) {
  const sortByPath = (a: ValidationError, b: ValidationError) => a.path.localeCompare(b.path);
  expect([...given].sort(sortByPath)).toEqual([...expected].sort(sortByPath));
}

function expectErrors(e: any, expectedErrors: ValidationError[]) {
  if (e instanceof NormalizeError) {
    expectValidationErrors(e.errors, expectedErrors)
    return
  }

  throw e
}
