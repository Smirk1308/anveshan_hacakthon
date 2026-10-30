/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const testDir = __dirname;
const projectRoot = path.resolve(testDir, "..");
const buildDir = path.join(testDir, ".tmp-build");
fs.rmSync(buildDir, { recursive: true, force: true });
fs.mkdirSync(buildDir, { recursive: true });

const compiledLibDir = path.join(buildDir, "src", "features", "patient", "lib");
fs.mkdirSync(compiledLibDir, { recursive: true });

for (const fileName of [
  "contracts.ts",
  "triage-client.ts",
  "ui-copy.ts",
  "api.ts",
]) {
  const sourcePath = path.join(
    projectRoot,
    "src",
    "features",
    "patient",
    "lib",
    fileName,
  );
  const source = fs.readFileSync(sourcePath, "utf8");
  const { outputText, diagnostics } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  });
  assert.equal(
    diagnostics?.some(
      (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
    ),
    false,
    `${fileName} should transpile without errors`,
  );
  fs.writeFileSync(
    path.join(compiledLibDir, fileName.replace(/\.ts$/, ".js")),
    outputText,
  );
}

const componentOutputDir = path.join(
  buildDir,
  "src",
  "features",
  "patient",
  "components",
);
fs.mkdirSync(componentOutputDir, { recursive: true });
const componentSource = fs.readFileSync(
  path.join(
    projectRoot,
    "src",
    "features",
    "patient",
    "components",
    "emergency-finder.tsx",
  ),
  "utf8",
);
const componentOutput = ts.transpileModule(componentSource, {
  compilerOptions: {
    esModuleInterop: true,
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
fs.writeFileSync(
  path.join(componentOutputDir, "emergency-finder.js"),
  componentOutput,
);

const fixtureDataDir = path.join(buildDir, "data");
fs.mkdirSync(fixtureDataDir, { recursive: true });
fs.copyFileSync(
  path.join(projectRoot, "data", "demo-hospitals.json"),
  path.join(fixtureDataDir, "demo-hospitals.json"),
);
process.env.NEXT_PUBLIC_TRIAGE_API_URL = "http://backend.test/";
const { TriageResponseSchema } = require(
  path.join(compiledLibDir, "contracts.js"),
);
const { requestTriage } = require(path.join(compiledLibDir, "api.js"));
const { getUiCopy } = require(path.join(compiledLibDir, "ui-copy.js"));
const { HospitalCard } = require(
  path.join(componentOutputDir, "emergency-finder.js"),
);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const backendResponse = JSON.parse(
  fs.readFileSync(
    path.join(testDir, "fixtures", "backend-triage-response.json"),
    "utf8",
  ),
);

test("serialized backend response reaches the UI adapter as live data, not demo", async () => {
  let requestedUrl;
  let requestOptions;
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    requestedUrl = url;
    requestOptions = options;
    return {
      ok: true,
      json: async () => backendResponse,
    };
  };
  let result;
  try {
    result = await requestTriage(
      "My father has chest pain and sweating.",
      { lat: 12.3, lng: 76.64, source: "manual", label: "Mysuru" },
      "en",
    );
  } finally {
    global.fetch = originalFetch;
  }

  assert.equal(requestedUrl, "http://backend.test/api/triage");
  assert.deepEqual(JSON.parse(requestOptions.body), {
    text: "My father has chest pain and sweating.",
    lat: 12.3,
    lng: 76.64,
    location_source: "manual",
    language: "en",
  });
  assert.equal(result.demo, false);
  assert.equal(
    result.data.recommendation.name,
    "Backend Contract Fixture Hospital",
  );
  assert.equal(result.data.alternatives.length, 2);
  assert.equal(
    result.data.alternatives[0].name,
    "Backend Alternative Hospital One",
  );
  assert.equal("hospital" in result.data.recommendation, false);
  assert.equal(result.data.recommendation.call_url, null);
  assert.equal(result.data.recommendation.directions_url, null);

  const cardHtml = renderToStaticMarkup(
    React.createElement(HospitalCard, {
      match: result.data.recommendation,
      copy: getUiCopy("en"),
      locationAvailable: true,
    }),
  );
  assert.match(cardHtml, /Backend Contract Fixture Hospital/);
  assert.match(cardHtml, /Public-source research/);
  assert.match(cardHtml, /Call unavailable/);
  assert.match(cardHtml, /google\\.com\\/maps\\/dir\\//);
  assert.match(cardHtml, /origin=12\\.300000%2C76\\.640000/);
  assert.match(cardHtml, /destination=12\\.302000%2C76\\.645000/);

  const disabledCardHtml = renderToStaticMarkup(
    React.createElement(HospitalCard, {
      match: result.data.recommendation,
      copy: getUiCopy("en"),
      locationAvailable: false,
    }),
  );
  assert.match(disabledCardHtml, /Directions unavailable/);
  assert.doesNotMatch(cardHtml, /Synthetic demo/);
});

test("flat backend records may omit unavailable action URLs", () => {
  const payload = structuredClone(backendResponse);
  delete payload.recommendation.call_url;
  delete payload.recommendation.directions_url;
  delete payload.alternatives[0].call_url;
  delete payload.alternatives[0].directions_url;

  const parsed = TriageResponseSchema.parse(payload);
  assert.equal(parsed.recommendation.call_url, undefined);
  assert.equal(parsed.alternatives[0].directions_url, undefined);
});

test("demo fallback provides a coordinate-pinned directions URL", async () => {
  const previousApiUrl = process.env.NEXT_PUBLIC_TRIAGE_API_URL;
  delete process.env.NEXT_PUBLIC_TRIAGE_API_URL;
  try {
    const result = await requestTriage(
      "My friend may have swallowed poison.",
      { lat: 12.3, lng: 76.64, source: "manual", label: "Mysuru" },
      "en",
    );
    assert.equal(result.demo, true);
    const directions = new URL(result.data.recommendation.directions_url);
    assert.equal(directions.origin, "https://www.google.com");
    assert.equal(directions.pathname, "/maps/dir/");
    assert.equal(directions.searchParams.get("api"), "1");
    assert.equal(directions.searchParams.get("origin"), "12.300000,76.640000");
    assert.equal(directions.searchParams.get("destination"), "12.300800,76.641200");
  } finally {
    if (previousApiUrl === undefined) delete process.env.NEXT_PUBLIC_TRIAGE_API_URL;
    else process.env.NEXT_PUBLIC_TRIAGE_API_URL = previousApiUrl;
  }
});

test.after(() => {
  fs.rmSync(buildDir, { recursive: true, force: true });
});
