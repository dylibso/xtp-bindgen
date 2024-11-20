# xtp-bindgen

XTP Bindgen is an open source framework to generate PDK bindings for
[Extism](https://extism.org) plug-ins. It's used by the
[XTP Platform](https://www.getxtp.com/), but can be used outside of the platform
to define any Extism compatible plug-in system.

> Note: This repository hosts the core schema parser and validation code, and is
> not meant for typical day-to-day use. Instead, you should use the
> [`xtp` CLI]((https://docs.xtp.dylibso.com/docs/cli#installation)) to generate
> bindings from an
> [XTP Schema](https://docs.xtp.dylibso.com/docs/concepts/xtp-schema).

## Quickstart

### 1. Install the `xtp` CLI.

See installation instructions
[here](https://docs.xtp.dylibso.com/docs/cli#installation).

### 2. Create a schema using our OpenAPI-inspired IDL:

```yaml
version: v1-draft
exports: 
  CountVowels:
      input: 
          type: string
          contentType: text/plain; charset=utf-8
      output:
          $ref: "#/components/schemas/VowelReport"
          contentType: application/json
# components.schemas defined in example-schema.yaml...
```

> See an example in [example-schema.yaml](./example-schema.yaml), or a full
> "kitchen sink" example on
> [the docs page](https://docs.xtp.dylibso.com/docs/concepts/xtp-schema/).

### 3. Generate bindings to use from your plugins:

```
xtp plugin init --schema-file ./example-schema.yaml
  > 1. TypeScript                      
    2. Go                              
    3. Rust                            
    4. Python                          
    5. C#                              
    6. Zig                             
    7. C++                             
    8. GitHub Template                 
    9. Local Template
```

This will create an entire boilerplate plugin project for you to get started
with. Implement the empty function(s), and run `xtp plugin build` to compile
your plugin.

## How Does It Work?

[Extism](https://extism.org) has a very simple bytes-in / bytes-out interface.
The host and the guest must agree on the interface used (exports functions,
imports functions, and types). The purpose of this project is to create a
canonical document and set of tools for defining this interface and generating
bindings. That document is the
[XTP Schema](https://docs.xtp.dylibso.com/docs/concepts/xtp-schema). This is an
IDL of our creation. It is similar to [OpenAPI](https://www.openapis.org/), but
is focused on defining plug-in interfaces, not HTTP interfaces.

Once you define your interface as a schema, you can use one of the bindgens to
generate code. We have some official bindgens available for writing PDKs, but
more will be availble soon for a variety of purposes. There may also be
community bindgens you can use.

- [TypeScript](https://github.com/dylibso/xtp-typescript-bindgen)
- [Go](https://github.com/dylibso/xtp-go-bindgen)
- [Python](https://github.com/dylibso/xtp-python-bindgen)
- [Rust](https://github.com/dylibso/xtp-rust-bindgen)
- [C#](https://github.com/dylibso/xtp-csharp-bindgen)
- [Zig](https://github.com/dylibso/xtp-zig-bindgen)
- [C++](https://github.com/dylibso/xtp-cpp-bindgen)

## How Do I Use A Bindgen?

You can use the [XTP CLI](https://docs.xtp.dylibso.com/docs/cli/) to generate
plug-ins.

> _Note_: You don't need to authenticate to XTP to use the plugin generator

Use the `plugin init` command to generate a plugin:

```
xtp plugin init \
    --schema myschema.yaml \
    --template @dylibso/xtp-typescript-bindgen \
    --path ./myplugin \
    --feature none
```

You can point to a bindgen template on github or directly to a bindgen bundle.

## How Do I Write A Bindgen?

> We recommended that you use any of the existing bindgens as a starting point
> for writing your own bindgen.

A bindgen is simply a zip file with the following attributes:

- `plugin.wasm` an extism plugin to generate the code
- `config.yaml` a config file for the generator
- `template` a template folder of files and templates that the generator will
  recursively process

For reference, Here is what is inside the typescript bindgen:

```
$ tree bundle
bundle
├── config.yaml
├── plugin.wasm
└── template
    ├── esbuild.js
    ├── package.json.ejs
    ├── src
    │   ├── index.d.ts.ejs
    │   ├── index.ts.ejs
    │   ├── main.ts.ejs
    │   └── pdk.ts.ejs
    ├── tsconfig.json
    └── xtp.toml.ejs
```

The XTP CLI will download and unpack this template, it will load the plugin, and
it will recursively walk through the template and pass each file through the
plugin to be rendered. Our official bindgens currently use typescript and EJS to
render the projects, but these are not mandatory. It can be any Extism plug-in.
