import { parse } from '../src/index';

const testSchema = {
  "version": "v1-draft",
  "exports": {
    "voidFunc": {
      "description": "This demonstrates how you can create an export with\nno inputs or outputs.\n"
    },
    "primitiveTypeFunc": {
      "description": "This demonstrates how you can accept or return primtive types.\nThis function takes a utf8 string and returns a json encoded boolean\n",
      "input": {
        "type": "string",
        "description": "A string passed into plugin input",
        "contentType": "text/plain; charset=utf-8"
      },
      "output": {
        "type": "boolean",
        "description": "A boolean encoded as json",
        "contentType": "application/json"
      },
      "codeSamples": [
        {
          "lang": "typescript",
          "label": "Test if a string has more than one character.\nCode samples show up in documentation and inline in docstrings\n",
          "source": "function primitiveTypeFunc(input: string): boolean {\n  return input.length > 1\n}\n"
        }
      ]
    },
    "referenceTypeFunc": {
      "description": "This demonstrates how you can accept or return references to schema types.\nAnd it shows how you can define an enum to be used as a property or input/output.\n",
      "input": {
        "contentType": "application/json",
        "$ref": "#/components/schemas/Fruit"
      },
      "output": {
        "contentType": "application/json",
        "$ref": "#/components/schemas/ComplexObject"
      }
    }
  },
  "imports": {
    "eatAFruit": {
      "description": "This is a host function. Right now host functions can only be the type (i64) -> i64.\nWe will support more in the future. Much of the same rules as exports apply.\n",
      "input": {
        "contentType": "text/plain; charset=utf-8",
        "$ref": "#/components/schemas/Fruit"
      },
      "output": {
        "type": "boolean",
        "description": "boolean encoded as json",
        "contentType": "application/json"
      }
    }
  },
  "components": {
    "schemas": {
      "Fruit": {
        "description": "A set of available fruits you can consume",
        "enum": [
          "apple",
          "orange",
          "banana",
          "strawberry"
        ]
      },
      "GhostGang": {
        "description": "A set of all the enemies of pac-man",
        "enum": [
          "blinky",
          "pinky",
          "inky",
          "clyde"
        ]
      },
      "ComplexObject": {
        "description": "A complex json object",
        "properties": {
          "ghost": {
            "$ref": "#/components/schemas/GhostGang",
            "description": "I can override the description for the property here"
          },
          "aBoolean": {
            "type": "boolean",
            "description": "A boolean prop"
          },
          "aString": {
            "type": "string",
            "description": "An string prop"
          },
          "anInt": {
            "type": "integer",
            "format": "int32",
            "description": "An int prop"
          },
          "anOptionalDate": {
            "type": "string",
            "format": "date-time",
            "description": "A datetime object, we will automatically serialize and deserialize\nthis for you.",
            "nullable": true
          }
        }
      },
      "MapSchema": {
          "additionalProperties": {
              "type": "string"
          }
      },
    }
  }
}

test('parse-v1-document', () => {
  const doc = parse(JSON.stringify(testSchema))

  // check top level document is correct
  expect(doc.version).toBe('v1')
  expect(Object.keys(doc.schemas).length).toBe(4)
  expect(doc.exports.length).toBe(3)
  expect(doc.imports.length).toBe(1)

  const enumSchema1 = doc.schemas['Fruit']
  expect(enumSchema1.type).toBe('enum')
  expect(enumSchema1.enum).toStrictEqual(testSchema.components.schemas['Fruit'].enum)

  const enumSchema2 = doc.schemas['GhostGang']
  expect(enumSchema2.type).toBe('enum')
  expect(enumSchema2.enum).toStrictEqual(testSchema.components.schemas['GhostGang'].enum)

  const schema3 = doc.schemas['ComplexObject']
  expect(schema3.type).toBe('object')
  const properties = schema3.properties

  // proves we derferenced it
  expect(properties[0].$ref?.enum).toStrictEqual(testSchema.components.schemas['GhostGang'].enum)
  expect(properties[0].$ref?.name).toBe('GhostGang')
  expect(properties[0].name).toBe('ghost')

  const mapSchema = doc.schemas['MapSchema']
  expect(mapSchema.type).toBe('map')
  expect(mapSchema.additionalProperties).toStrictEqual({ type: 'string' })

  const exp = doc.exports[2]
  // proves we derferenced it
  expect(exp.input?.$ref?.enum).toStrictEqual(testSchema.components.schemas['Fruit'].enum)
  expect(exp.output?.contentType).toBe('application/json')
})
3