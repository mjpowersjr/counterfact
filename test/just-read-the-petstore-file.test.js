/* eslint-disable jest/require-top-level-describe */
import fs from "node:fs/promises";

test("reads the petstore file", async () => {
  const text = await fs
    .readFile("./petstore.yaml", "utf8")
    .catch((error) => error);

  expect(text).toStrictEqual(expect.stringContaining("openapi: 3.0.2"));
});

test("reads the package.json file", async () => {
  const text = await fs
    .readFile("./package.json", "utf8")
    .catch((error) => error);

  expect(text).toStrictEqual(expect.stringContaining("counterfact"));
});
