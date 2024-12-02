# XTP Schema Plugin

The XTP schema plugin is an wrapper around xtp-bindgen. It packages up
some of the functionality of the library into an Extism plugin.

It has 3 exports:

* validate_schema
* get_json_schema
* has_imports

## Usage

Compile:

```
xtp plugin build
```

Run:

```
cat ../example-schema.yaml | xtp plugin call dist/plugin.wasm validate_schema --stdin --wasi | jq

{
  "valid": true,
  //....
}
```


