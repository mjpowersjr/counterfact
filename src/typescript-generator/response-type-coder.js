import { printObject } from "./printers.js";
import { SchemaTypeCoder } from "./schema-type-coder.js";
import { TypeCoder } from "./type-coder.js";

export class ResponseTypeCoder extends TypeCoder {
  constructor(requirement, openApi2MediaTypes = []) {
    super(requirement);

    this.openApi2MediaTypes = openApi2MediaTypes;
  }

  names() {
    return super.names(this.requirement.data.$ref.split("/").at(-1));
  }

  buildContentObjectType(script, response) {
    if (response.has("content")) {
      return response.get("content").map((content, mediaType) => [
        mediaType,
        `{ 
            schema:  ${new SchemaTypeCoder(content.get("schema")).write(script)}
         }`,
      ]);
    }

    return this.openApi2MediaTypes.map((mediaType) => [
      mediaType,
      `{
            schema: ${new SchemaTypeCoder(response.get("schema")).write(script)}
         }`,
    ]);
  }

  printContentObjectType(script, response) {
    if (response.has("content") || response.has("schema")) {
      return printObject(this.buildContentObjectType(script, response));
    }

    return "never";
  }

  buildHeaders(script, response) {
    return response
      .get("headers")
      .map((value, name) => [
        name,
        `{ schema: ${new SchemaTypeCoder(value.get("schema") ?? value).write(
          script,
        )}}`,
      ]);
  }

  printHeaders(script, response) {
    if (!response.has("headers")) {
      return "never";
    }

    return printObject(this.buildHeaders(script, response));
  }

  printRequiredHeaders(response) {
    const requiredHeaders = (response.get("headers") ?? [])
      .map((value, name) => ({ name, required: value.data.required }))
      .filter(({ required }) => required)
      .map(({ name }) => `"${name}"`);

    return requiredHeaders.length === 0 ? "never" : requiredHeaders.join(" | ");
  }

  modulePath() {
    return `components/${this.requirement.data.$ref.split("/").at(-1)}.ts`;
  }

  writeCode(script) {
    return `{
          headers: ${this.printHeaders(script, this.requirement)};
          requiredHeaders: ${this.printRequiredHeaders(this.requirement)};
          content: ${this.printContentObjectType(script, this.requirement)};
        }`;
  }
}
