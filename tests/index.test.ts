import { parse } from '../src/index';
import { Schema } from '../src/normalizer'

const testSchema = {
  "exports": [
    {
      "name": "voidFunc",
      "description": "This demonstrates how you can create an export with\nno inputs or outputs.\n"
    },
    {
      "name": "primitiveTypeFunc",
      "input": {
        "type": "string",
        "contentType": "text/plain; charset=UTF-8",
        "description": "A string passed into plugin input"
      },
      "output": {
        "type": "boolean",
        "contentType": "application/json",
        "description": "A boolean encoded as json"
      },
      "codeSamples": [
        {
          "lang": "typescript",
          "label": "Test if a string has more than one character.\nCode samples show up in documentation and inline in docstrings\n",
          "source": "function primitiveTpeFunc(input: string): boolean {\n  return input.length > 1\n}\n"
        }
      ],
      "description": "This demonstrates how you can accept or return primtive types.\nThis function takes a utf8 string and returns a json encoded boolean\n"
    },
    {
      "name": "referenceTypeFunc",
      "input": {
        "$ref": "#/schemas/Fruit"
      },
      "output": {
        "$ref": "#/schemas/ComplexObject"
      },
      "description": "This demonstrates how you can accept or return references to schema types.\nAnd it shows how you can define an enum to be used as a property or input/output.\n"
    }
  ],
  "imports": [
    {
      "name": "eatAFruit",
      "input": {
        "$ref": "#/schemas/Fruit"
      },
      "output": {
        "type": "boolean",
        "contentType": "application/json",
        "description": "boolean encoded as json"
      },
      "description": "This is a host function. Right now host functions can only be the type (i64) -> i64.\nWe will support more in the future. Much of the same rules as exports apply.\n"
    }
  ],
  "schemas": [
    {
      "enum": [
        "apple",
        "orange",
        "banana",
        "strawberry"
      ],
      "name": "Fruit",
      "description": "A set of available fruits you can consume"
    },
    {
      "enum": [
        "blinky",
        "pinky",
        "inky",
        "clyde"
      ],
      "name": "GhostGang",
      "description": "A set of all the enemies of pac-man"
    },
    {
      "name": "ComplexObject",
      "required": [
        "ghost",
        "aBoolean",
        "aString",
        "anInt"
      ],
      "properties": [
        {
          "$ref": "#/schemas/GhostGang",
          "name": "ghost",
          "description": "I can override the description for the property here"
        },
        {
          "name": "aBoolean",
          "type": "boolean",
          "description": "A boolean prop"
        },
        {
          "name": "aString",
          "type": "integer",
          "format": "int32",
          "description": "An int prop"
        },
        {
          "name": "anInt",
          "type": "integer",
          "format": "int32",
          "description": "An int prop"
        },
        {
          "name": "anOptionalDate",
          "type": "string",
          "format": "date-time",
          "description": "A datetime object, we will automatically serialize and deserialize\nthis for you.\n"
        }
      ],
      "contentType": "application/json",
      "description": "A complex json object"
    }
  ],
  "version": "v1-draft"
}


test('parse-v1-document', () => {
  const doc = parse(JSON.stringify(testSchema))

  // check top level document is correct
  expect(doc.version).toBe('v1')
  expect(Object.keys(doc.schemas).length).toBe(3)
  expect(doc.exports.length).toBe(3)
  expect(doc.imports.length).toBe(1)

  const enumSchema1 = doc.schemas['Fruit']
  expect(enumSchema1.enum).toStrictEqual(testSchema.schemas[0].enum)

  const enumSchema2 = doc.schemas['GhostGang']
  expect(enumSchema2.enum).toStrictEqual(testSchema.schemas[1].enum)

  const schema3 = doc.schemas['ComplexObject']
  const properties = schema3.properties

  // proves we derferenced it
  expect(properties[0].$ref?.enum).toStrictEqual(testSchema.schemas[1].enum)
  expect(properties[0].$ref?.name).toBe('GhostGang')
  expect(properties[0].name).toBe('ghost')

  const exp = doc.exports[2]
  // proves we derferenced it
  expect(exp.input?.$ref?.enum).toStrictEqual(testSchema.schemas[0].enum)
  expect(exp.output?.$ref?.contentType).toBe('application/json')
  expect(exp.output?.contentType).toBe('application/json')
})
