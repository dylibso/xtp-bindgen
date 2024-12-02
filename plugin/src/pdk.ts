import { XtpSchema } from "@dylibso/xtp-bindgen";

/**
 *
 */
export class SchemaValidationLog {
  /**
   * Validation message
   */
  // @ts-expect-error TS2564
  message: string;

  /**
   * Path in the schema where the issue occurred
   */
  // @ts-expect-error TS2564
  path: string;

  static fromJson(obj: any): SchemaValidationLog {
    return {
      ...obj,
    };
  }

  static toJson(obj: SchemaValidationLog): any {
    return {
      ...obj,
    };
  }
}

/**
 *
 */
export class SchemaValidationResult {
  /**
   * List of validation errors
   */
  // @ts-expect-error TS2564
  errors: Array<SchemaValidationLog>;

  /**
   * The validated schema
   */
  schema?: XtpSchema;

  /**
   * Indicates if the schema is valid
   */
  // @ts-expect-error TS2564
  valid: boolean;

  /**
   * List of validation warnings
   */
  // @ts-expect-error TS2564
  warnings: Array<SchemaValidationLog>;
}
