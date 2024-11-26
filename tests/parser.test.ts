import { parseAny, V1Schema } from '../src/parser';
import * as yaml from 'js-yaml'
import * as fs from 'fs'

const invalidV1Doc: any = yaml.load(fs.readFileSync('./tests/schemas/v1-invalid-doc.yaml', 'utf8'))
const validV1Doc: any = yaml.load(fs.readFileSync('./tests/schemas/v1-valid-doc.yaml', 'utf8'))

test("parse-empty-v1-document", () => {
  const doc = parseAny({})
  expect(doc.errors).toBeInstanceOf(Array)

  expect(doc.errors![0].path).toEqual("#/version")
})

test("parse-invalid-v1-document", () => {
  const doc = parseAny(invalidV1Doc)
  expect(doc.errors).toBeInstanceOf(Array)

  const paths = doc.errors!.map(e => e.path)
  expect(paths).toStrictEqual([
    "#/exports/invalidFunc1/input",
    "#/exports/invalidFunc1/output",
    "#/components/schemas/ComplexObject/properties/aBoolean",
    "#/components/schemas/ComplexObject/properties/aString",
    "#/components/schemas/ComplexObject/properties/anInt",
    "#/components/schemas/ComplexObject/properties/aNonType",
  ])
})

test("parse-valid-v1-document", () => {
  const doc = parseAny(validV1Doc)
  expect(doc.errors).toStrictEqual([])
  expect(doc.warnings).toStrictEqual([])

  const schema = doc as V1Schema

  expect(schema.version).toEqual('v1-draft')
})
