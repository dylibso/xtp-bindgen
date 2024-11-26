import * as main from "./main";

export function get_json_schema(): number {
  const output = main.get_json_schemaImpl();

  Host.outputString(output);

  return 0;
}

export function has_imports(): number {
  const input = Host.inputString();

  const output = main.has_importsImpl(input);

  Host.outputString(output);

  return 0;
}

export function validate_schema(): number {
  const input = Host.inputString();

  const output = main.validate_schemaImpl(input);

  Host.outputString(JSON.stringify(output));

  return 0;
}
