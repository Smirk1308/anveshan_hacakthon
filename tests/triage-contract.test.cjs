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
  "voice-client.ts",
  "nearby-contracts.ts",
  "nearby-client.ts",
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
for (const compName of [
  "ambulance-request.tsx",
  "private-ambulance-directory.tsx",
  "nearby-help.tsx",
  "emergency-finder.tsx",
]) {
  const componentSource = fs.readFileSync(
    path.join(
      projectRoot,
      "src",
      "features",
      "patient",
      "components",
      compName,
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
    path.join(componentOutputDir, compName.replace(/\.tsx$/, ".js")),
    componentOutput,
  );
}

const fixtureDataDir = path.join(buildDir, "data");
fs.mkdirSync(fixtureDataDir, { recursive: true });
fs.copyFileSync(
  path.join(projectRoot, "data", "demo-hospitals.json"),
  path.join(fixtureDataDir, "demo-hospitals.json"),
);
process.env.NEXT_PUBLIC_TRIAGE_API_URL = "http://backend.test/";
const { TriageResponseSchema, VoiceTranscriptionResponseSchema } = require(
  path.join(compiledLibDir, "contracts.js"),
);
const {
  requestTriage,
  requestVoiceTranscription,
  fetchNearbyConfig,
  registerNearbyHelper,
  updateHelperAvailability,
  stopHelperAvailability,
  createHelpRequest,
  getHelpRequestStatus,
  claimHelpRequest,
  cancelHelpRequest,
  NearbyConfigSchema,
  NearbyRequestCreateResponseSchema,
  NearbyClaimResponseSchema,
  NearbyApiError,
} = require(path.join(compiledLibDir, "api.js"));
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
  assert.ok(
    result.data.recommendation.directions_url.startsWith(
      "https://www.google.com/maps/dir/",
    ),
  );

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
  assert.ok(cardHtml.includes("https://www.google.com/maps/dir/?api=1"));
  assert.ok(cardHtml.includes("origin=12.300000%2C76.640000"));
  assert.ok(cardHtml.includes("destination=12.302000%2C76.645000"));

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
    assert.equal(
      directions.searchParams.get("destination"),
      "12.300800,76.641200",
    );
  } finally {
    if (previousApiUrl === undefined)
      delete process.env.NEXT_PUBLIC_TRIAGE_API_URL;
    else process.env.NEXT_PUBLIC_TRIAGE_API_URL = previousApiUrl;
  }
});

test("voice transcription endpoint contract sends raw audio bytes and parses response", async () => {
  let requestedUrl;
  let requestHeaders;
  let requestBody;
  let requestMethod;

  const mockResponse = {
    text: "ನನ್ನ ತಂದೆಗೆ ಎದೆ ನೋವು ಇದೆ",
    language: "kn",
    duration_seconds: 3.2,
  };

  const sampleAudioBytes = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    requestedUrl = url;
    requestHeaders = options.headers;
    requestBody = options.body;
    requestMethod = options.method;
    return {
      ok: true,
      status: 200,
      json: async () => mockResponse,
    };
  };

  try {
    const result = await requestVoiceTranscription(sampleAudioBytes, "kn", {
      apiUrl: "http://backend.test",
      mimeType: "audio/webm",
    });

    assert.equal(
      requestedUrl,
      "http://backend.test/api/voice/transcribe?language=kn",
    );
    assert.equal(requestMethod, "POST");
    assert.equal(requestHeaders["Content-Type"], "audio/webm");
    assert.equal(requestBody, sampleAudioBytes);
    assert.equal(result.text, "ನನ್ನ ತಂದೆಗೆ ಎದೆ ನೋವು ಇದೆ");
    assert.equal(result.language, "kn");
    assert.equal(result.duration_seconds, 3.2);

    const validated = VoiceTranscriptionResponseSchema.parse(result);
    assert.equal(validated.text, "ನನ್ನ ತಂದೆಗೆ ಎದೆ ನೋವು ಇದೆ");
  } finally {
    global.fetch = originalFetch;
  }
});

test("nearby config contract: fetchNearbyConfig returns valid configuration and radius", async () => {
  const mockConfig = {
    enabled: true,
    public_key: "BEl_example_vapid_public_key_string",
    radius_m: 500,
    request_ttl_seconds: 600,
    helper_ttl_seconds: 900,
    location_fresh_seconds: 180,
  };

  let requestedUrl;
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    requestedUrl = url;
    return {
      ok: true,
      status: 200,
      json: async () => mockConfig,
    };
  };

  try {
    const config = await fetchNearbyConfig({ apiUrl: "http://backend.test" });
    assert.equal(requestedUrl, "http://backend.test/api/nearby/config");
    assert.equal(config.enabled, true);
    assert.equal(config.public_key, "BEl_example_vapid_public_key_string");
    assert.equal(config.radius_m, 500);
    assert.equal(config.request_ttl_seconds, 600);

    const validated = NearbyConfigSchema.parse(config);
    assert.equal(validated.radius_m, 500);
  } finally {
    global.fetch = originalFetch;
  }
});

test("nearby helper registration and availability lifecycle", async () => {
  let registerBody;
  let availHeader;
  let availBody;
  let stopHeader;

  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    if (url.includes("/helpers/register")) {
      registerBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ helper_token: "tok_helper_abc123" }),
      };
    }
    if (url.includes("/helpers/availability")) {
      availHeader = options.headers["Authorization"];
      availBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ available_until: 1700000900, radius_m: 500 }),
      };
    }
    if (url.includes("/helpers/stop")) {
      stopHeader = options.headers["Authorization"];
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: "stopped" }),
      };
    }
    throw new Error(`Unexpected url: ${url}`);
  };

  try {
    const subscription = {
      endpoint: "https://fcm.googleapis.com/fcm/send/test_sub",
      keys: { p256dh: "key_p256dh", auth: "key_auth" },
    };
    const regResult = await registerNearbyHelper(subscription, {
      apiUrl: "http://backend.test",
    });
    assert.equal(regResult.helper_token, "tok_helper_abc123");
    assert.equal(
      registerBody.endpoint,
      "https://fcm.googleapis.com/fcm/send/test_sub",
    );

    const availResult = await updateHelperAvailability(
      "tok_helper_abc123",
      { lat: 12.2958, lng: 76.6394 },
      { apiUrl: "http://backend.test" },
    );
    assert.equal(availHeader, "Bearer tok_helper_abc123");
    assert.equal(availBody.lat, 12.2958);
    assert.equal(availResult.available_until, 1700000900);

    const stopResult = await stopHelperAvailability("tok_helper_abc123", {
      apiUrl: "http://backend.test",
    });
    assert.equal(stopHeader, "Bearer tok_helper_abc123");
    assert.equal(stopResult.status, "stopped");
  } finally {
    global.fetch = originalFetch;
  }
});

test("nearby request creation, queued delivery count, and status check", async () => {
  let createdBody;
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    if (url.includes("/api/nearby/requests") && options.method === "POST") {
      createdBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          request_id: "req_xyz789",
          requester_token: "tok_requester_secret",
          status: "open",
          alerts_queued: 3,
          radius_m: 500,
          expires_at: 1700000600,
          message: "Keep 108 or 112 available",
        }),
      };
    }
    if (
      url.includes("/api/nearby/requests/req_xyz789") &&
      options.method === "GET"
    ) {
      assert.equal(
        options.headers["Authorization"],
        "Bearer tok_requester_secret",
      );
      return {
        ok: true,
        status: 200,
        json: async () => ({
          request_id: "req_xyz789",
          status: "open",
          category: "cardiac",
          expires_at: 1700000600,
        }),
      };
    }
    throw new Error(`Unexpected url: ${url}`);
  };

  try {
    // Non-consent throws client-side before calling API
    await assert.rejects(
      async () => {
        await createHelpRequest(
          { lat: 12.2958, lng: 76.6394, category: "cardiac", consent: false },
          { apiUrl: "http://backend.test" },
        );
      },
      (err) => {
        assert.ok(err instanceof NearbyApiError);
        assert.match(
          err.message,
          /Consent to share location and category is required/,
        );
        return true;
      },
    );

    const result = await createHelpRequest(
      { lat: 12.2958, lng: 76.6394, category: "cardiac", consent: true },
      { apiUrl: "http://backend.test" },
    );

    assert.equal(createdBody.lat, 12.2958);
    assert.equal(createdBody.consent, true);
    assert.equal(result.request_id, "req_xyz789");
    assert.equal(result.alerts_queued, 3);
    assert.equal(result.status, "open");

    const validated = NearbyRequestCreateResponseSchema.parse(result);
    assert.equal(validated.alerts_queued, 3);

    const statusCheck = await getHelpRequestStatus(
      "req_xyz789",
      "tok_requester_secret",
      {
        apiUrl: "http://backend.test",
      },
    );
    assert.equal(statusCheck.status, "open");
    assert.equal(statusCheck.category, "cardiac");
  } finally {
    global.fetch = originalFetch;
  }
});

test("nearby claim and cancel contract with error states", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    if (url.includes("/claim")) {
      assert.equal(options.headers["Authorization"], "Bearer tok_helper_claim");
      return {
        ok: true,
        status: 200,
        json: async () => ({
          request_id: "req_xyz789",
          status: "claimed",
          category: "cardiac",
          requester_location: { lat: 12.296, lng: 76.64 },
          directions_url:
            "https://www.google.com/maps/dir/?api=1&destination=12.296000%2C76.640000&travelmode=walking",
        }),
      };
    }
    if (url.includes("/cancel")) {
      assert.equal(options.headers["Authorization"], "Bearer tok_req_cancel");
      return {
        ok: true,
        status: 200,
        json: async () => ({
          request_id: "req_xyz789",
          status: "cancelled",
        }),
      };
    }
    throw new Error(`Unexpected url: ${url}`);
  };

  try {
    const claimRes = await claimHelpRequest(
      "req_xyz789",
      "tok_helper_claim",
      { lat: 12.2959, lng: 76.6395 },
      { apiUrl: "http://backend.test" },
    );
    assert.equal(claimRes.status, "claimed");
    assert.ok(claimRes.directions_url.includes("travelmode=walking"));
    assert.equal(claimRes.requester_location.lat, 12.296);

    const validatedClaim = NearbyClaimResponseSchema.parse(claimRes);
    assert.equal(validatedClaim.status, "claimed");

    const cancelRes = await cancelHelpRequest("req_xyz789", "tok_req_cancel", {
      apiUrl: "http://backend.test",
    });
    assert.equal(cancelRes.status, "cancelled");
  } finally {
    global.fetch = originalFetch;
  }
});

test("voice transcription error handling surfaces specific errors for 413, 415, 422, and 503", async () => {
  const sampleAudioBytes = Buffer.from([0x01, 0x02, 0x03]);
  const originalFetch = global.fetch;

  for (const status of [413, 415, 422, 503]) {
    global.fetch = async () => ({
      ok: false,
      status,
      json: async () => ({ detail: `Error test detail for status ${status}` }),
    });

    await assert.rejects(
      async () => {
        await requestVoiceTranscription(sampleAudioBytes, "auto", {
          apiUrl: "http://backend.test",
          mimeType: "audio/webm",
        });
      },
      (err) => {
        assert.equal(err.name, "VoiceTranscriptionError");
        assert.equal(err.status, status);
        assert.ok(err.message.includes(`${status}`));
        return true;
      },
      `Should reject with VoiceTranscriptionError status ${status}`,
    );
  }
  global.fetch = originalFetch;
});

test("configured backend triage failure throws and does not fabricate demo results", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: false,
    status: 500,
    json: async () => ({ detail: "Internal Server Error" }),
  });

  try {
    await assert.rejects(
      async () => {
        await requestTriage(
          "My father has chest pain and sweating.",
          { lat: 12.3, lng: 76.64, source: "manual", label: "Mysuru" },
          "en",
        );
      },
      (err) => {
        assert.match(
          err.message,
          /The matching service is not available right now/,
        );
        return true;
      },
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("ambulance directory and hospital ambulance SMS contract", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (url.includes("/api/ambulances")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          generated_on: "2026-10-31",
          geography: "Mysuru",
          summary: { local_provider_candidates: 1 },
          providers: [
            {
              provider_id: "amb_1",
              name: "Mysuru Ambulance Service",
              provider_type: "private_provider",
              record_status: "public_listing",
              public_contacts: [
                {
                  number: "+919876543210",
                  source_id: "src_1",
                  number_type: "mobile",
                },
              ],
              address_or_service_location: "Mysuru",
              source_ids: ["src_1"],
            },
          ],
          networks_or_aggregators: [],
          sources: [
            {
              source_id: "src_1",
              title: "Public Directory",
              url: "https://example.com",
            },
          ],
        }),
      };
    }
    throw new Error(`Unexpected url: ${url}`);
  };

  try {
    const { default: PrivateAmbulanceDirectory } = require(
      path.join(componentOutputDir, "private-ambulance-directory.js"),
    );
    const html = renderToStaticMarkup(
      React.createElement(PrivateAmbulanceDirectory, { language: "en" }),
    );
    assert.match(html, /Private ambulance options/);
    assert.match(html, /Loading public directory…/);

    const { default: AmbulanceRequest } = require(
      path.join(componentOutputDir, "ambulance-request.js"),
    );
    const ambulanceHtml = renderToStaticMarkup(
      React.createElement(AmbulanceRequest, {
        hospital: {
          name: "Test Hospital",
          phone: "+919876543210",
          services: ["24x7 Ambulance Service"],
        },
        emergency: backendResponse.emergency,
        location: { lat: 12.3, lng: 76.64, source: "gps", label: "Mysuru" },
        language: "en",
      }),
    );
    assert.match(ambulanceHtml, /Request an ambulance from this hospital/);
    assert.match(ambulanceHtml, /\+919876543210/);
  } finally {
    global.fetch = originalFetch;
  }
});

test.after(() => {
  fs.rmSync(buildDir, { recursive: true, force: true });
});
