import Ajv from "ajv";
import { SchemaValidationLog, SchemaValidationResult } from "./pdk";
import YAML from "js-yaml";
import JSON_SCHEMA from "BUILTIN_JSON_SCHEMA";
import { parseYaml, XtpSchema, NormalizeError } from "@dylibso/xtp-bindgen";

/**
 * Retrieves the JSON schema used for validation
 *
 * @returns {string} The JSON schema for xtp schema
 */
export function get_json_schemaImpl(): string {
  return JSON.stringify(JSON_SCHEMA);
}

/**
 * Checks if the input schema has any imports
 *
 * @param input {string} Extension point schema in YAML format
 * @returns {string} Returns &#39;1&#39; if imports exist, empty string otherwise
 */
export function has_importsImpl(input: string): string {
  const schema = validate_schemaImpl(input);
  if (schema.valid) {
    const len = schema.schema?.imports?.length ?? 0;
    if (len > 0) {
      return "1";
    }
  }

  return "";
}

/**
 * Validates input data against a JSON schema
 *
 * @param input {string} XTP schema in YAML format
 * @returns {SchemaValidationResult}
 */
export function validate_schemaImpl(input: string): SchemaValidationResult {
  const schema = parseSchema(input);

  const warnings: SchemaValidationLog[] = [];
  const version = (input as any).version;
  if (version && version.endsWith("-draft")) {
    warnings.push({
      message: `Version ${version} is a draft version and may be exposed to breaking changes until we publish the final version. See XTP docs for more info https://docs.xtp.dylibso.com/docs/concepts/xtp-schema#versioning`,
      path: "#/version",
    });
  }

  if (schema instanceof NormalizeError) {
    return {
      valid: false,
      errors: schema.errors,
      warnings: warnings,
    };
  }

  return {
    valid: true,
    errors: [],
    warnings: warnings,
    schema: schema,
  };
}

function parseSchema(schema: any): XtpSchema | NormalizeError {
  try {
    return parseYaml(schema);
  } catch (e) {
    if (e instanceof NormalizeError) {
      return e;
    } else if (e instanceof Error) {
      return new NormalizeError(e.message + " at " + e.stack, [
        {
          message: e.message,
          path: "#",
        },
      ]);
    }

    throw e;
  }
}
