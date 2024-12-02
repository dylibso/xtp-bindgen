import { parseAny, V1Schema } from '../src/parser';
import * as yaml from 'js-yaml'
import * as fs from 'fs'

const validV1Doc: any = yaml.load(fs.readFileSync('./tests/schemas/v1-valid-doc.yaml', 'utf8'))

test("parse-empty-v1-document", () => {
  const doc = parseAny({})
  expect(doc.errors).toBeInstanceOf(Array)

  expect(doc.errors![0].path).toEqual("#/version")
})

test("parse-valid-v1-document", () => {
  const doc = parseAny(validV1Doc)
  expect(doc.errors).toStrictEqual([])
  expect(doc.warnings).toStrictEqual([])

  const schema = doc as V1Schema

  expect(schema.version).toEqual('v1-draft')
})
