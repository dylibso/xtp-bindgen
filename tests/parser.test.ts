import { parseAny, V1Schema } from '../src/parser';
import * as yaml from 'js-yaml'
import * as fs from 'fs'

const invalidV1Doc: any = yaml.load(fs.readFileSync('./tests/schemas/v1-invalid-doc.yaml', 'utf8'))
const validV1Doc: any = yaml.load(fs.readFileSync('./tests/schemas/v1-valid-doc.yaml', 'utf8'))

test("parse-empty-v1-document", () => {
  const { errors } = parseAny({})
  expect(errors).toBeInstanceOf(Array)

  expect(errors![0].path).toEqual("#/version")
})

test("parse-invalid-v1-document", () => {
  const { errors } = parseAny(invalidV1Doc)
  expect(errors).toBeInstanceOf(Array)

  const paths = errors!.map(e => e.path)
  //console.log(JSON.stringify(errors!, null, 4))
  expect(paths).toStrictEqual([
    "#/exports/invalidFunc1/input",
    "#/exports/invalidFunc1/output",
    "#/components/schemas/ComplexObject/properties/aBoolean",
    "#/components/schemas/ComplexObject/properties/aString",
    "#/components/schemas/ComplexObject/properties/anInt",
    "#/components/schemas/ComplexObject/properties/aNonType",
    // "#/components/schemas/ComplexObject/properties/aMapOfMapsOfNullableDateArrays/additionalProperties",
    // "#/components/schemas/ComplexObject/properties/aMapOfMapsOfNullableDateArrays/additionalProperties",
    // "#/components/schemas/ComplexObject/properties/aMapOfMapsOfNullableDateArrays/additionalProperties/additionalProperties",
    // "#/components/schemas/ComplexObject/properties/anArrayOfMaps/items",
  ])
})

test("parse-valid-v1-document", () => {
  const { doc, errors } = parseAny(validV1Doc)
  expect(errors).toStrictEqual([])

  const schema = doc as V1Schema

  expect(schema.version).toEqual('v1-draft')
})
