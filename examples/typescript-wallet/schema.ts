import fs from "node:fs";
import openapiTS, { astToString } from "openapi-typescript";

/**
 * Generate src/schema.d.ts from the Cartesi rollup OpenAPI spec,
 * mapping hex/address formats to viem types.
 */
const inputFile =
  "https://raw.githubusercontent.com/cartesi/openapi-interfaces/fce8cc7fcf2d2fcc1940e048cd16fb8550b09779/rollup.yaml";
const outputFile = "src/schema.d.ts";

const inject = "import { Address, Hex } from 'viem';\n";

console.log(`${inputFile} -> ${outputFile}`);

const ast = await openapiTS(inputFile, {
  transform(schemaObject) {
    if ("format" in schemaObject && schemaObject.format === "hex") {
      return schemaObject.nullable ? "Hex | null" : "Hex";
    }
    if ("format" in schemaObject && schemaObject.format === "address") {
      return schemaObject.nullable ? "Address | null" : "Address";
    }
  },
});

const output = inject + astToString(ast);
fs.writeFileSync(outputFile, output);
console.log("done");
