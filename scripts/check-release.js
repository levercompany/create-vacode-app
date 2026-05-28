#!/usr/bin/env node
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json");

const expectedTag = `v${packageJson.version}`;
const refType = process.env.GITHUB_REF_TYPE;
const refName = process.env.GITHUB_REF_NAME;

if (packageJson.name !== "create-vacode-app") {
  fail(`package.json name must be create-vacode-app, got ${packageJson.name}`);
}

if (packageJson.private) {
  fail("package.json must not set private=true for npm release");
}

if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(packageJson.version)) {
  fail(`package.json version must be SemVer, got ${packageJson.version}`);
}

if (refType && refType !== "tag") {
  fail(`release workflow must run from a tag, got ${refType}`);
}

if (refName && refName !== expectedTag) {
  fail(`tag/version mismatch: tag is ${refName}, package version expects ${expectedTag}`);
}

console.log(`[release] ${packageJson.name}@${packageJson.version}`);

function fail(message) {
  console.error(`[release:error] ${message}`);
  process.exit(1);
}
