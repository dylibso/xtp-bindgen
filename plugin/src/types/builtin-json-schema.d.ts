declare module "BUILTIN_JSON_SCHEMA" {
  const schema: any;

  export default schema;
}

declare global {
  const BUILTIN_JSON_SCHEMA: typeof import("BUILTIN_JSON_SCHEMA").default;
}
