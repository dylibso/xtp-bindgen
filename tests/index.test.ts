import { parse, helpers, MapType, ArrayType } from '../src/index';
const { isBoolean, isObject, isString, isEnum, isDateTime, isInt32, isMap } = helpers;
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
  expect(isInt32(properties[6])).toBe(true)
  expect(properties[6].required).toBe(false)

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

