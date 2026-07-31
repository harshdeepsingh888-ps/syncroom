import assert from "node:assert/strict";
import { createServer, type Server as HttpServer } from "node:http";
import test from "node:test";
import { createApp } from "../app.js";
import { env } from "../config/env.js";

type TestHarness = {
  httpServer: HttpServer;
  baseUrl: string;
};

async function startServer(): Promise<TestHarness> {
  const app = createApp();
  const httpServer = createServer(app);

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", () => {
      httpServer.off("error", reject);
      resolve();
    });
  });

  const address = httpServer.address();
  if (!address || typeof address === "string") {
    throw new Error("Server failed to bind to a port.");
  }

  return {
    httpServer,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function stopServer(harness: TestHarness): Promise<void> {
  if (harness.httpServer.listening) {
    await new Promise<void>((resolve) => harness.httpServer.close(() => resolve()));
  }
}

test("GET /api/youtube/search rejects missing or empty search query", async () => {
  const harness = await startServer();
  try {
    const response = await fetch(`${harness.baseUrl}/api/youtube/search`);
    assert.equal(response.status, 400);

    const body = (await response.json()) as { error: { code: string; message: string } };
    assert.equal(body.error.code, "INVALID_QUERY");
  } finally {
    await stopServer(harness);
  }
});

test("GET /api/youtube/search rejects query under 2 characters", async () => {
  const harness = await startServer();
  try {
    const response = await fetch(`${harness.baseUrl}/api/youtube/search?q=a`);
    assert.equal(response.status, 400);

    const body = (await response.json()) as { error: { code: string; message: string } };
    assert.equal(body.error.code, "QUERY_TOO_SHORT");
  } finally {
    await stopServer(harness);
  }
});

test("GET /api/youtube/search returns 503 when YOUTUBE_DATA_API_KEY is missing", async () => {
  const originalKey = env.YOUTUBE_DATA_API_KEY;
  env.YOUTUBE_DATA_API_KEY = undefined;

  const harness = await startServer();
  try {
    const response = await fetch(`${harness.baseUrl}/api/youtube/search?q=react`);
    assert.equal(response.status, 503);

    const body = (await response.json()) as { error: { code: string; message: string } };
    assert.equal(body.error.code, "YOUTUBE_API_KEY_MISSING");
  } finally {
    env.YOUTUBE_DATA_API_KEY = originalKey;
    await stopServer(harness);
  }
});

test("GET /api/youtube/search normalizes Google YouTube Data API response and unescapes HTML entities", async () => {
  const originalKey = env.YOUTUBE_DATA_API_KEY;
  env.YOUTUBE_DATA_API_KEY = "test-mock-api-key";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request) => {
    const urlString = url.toString();
    if (urlString.includes("googleapis.com/youtube/v3/search")) {
      assert.ok(urlString.includes("key=test-mock-api-key"));
      assert.ok(decodeURIComponent(urlString.replace(/\+/g, " ")).includes("q=React & Node"));

      return new Response(
        JSON.stringify({
          nextPageToken: "token_page_2",
          items: [
            {
              id: { kind: "youtube#video", videoId: "dQw4w9WgXcQ" },
              snippet: {
                title: "Rick Astley &amp; &#39;Never Gonna Give You Up&#39;",
                channelTitle: "Official &quot;Rick&quot; Channel",
                thumbnails: { medium: { url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg" } },
                publishedAt: "1987-07-27T00:00:00Z",
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    return originalFetch(url);
  }) as typeof fetch;

  const harness = await startServer();
  try {
    const response = await fetch(`${harness.baseUrl}/api/youtube/search?q=React%20%26%20Node`);
    assert.equal(response.status, 200);

    const body = (await response.json()) as {
      items: Array<{
        videoId: string;
        title: string;
        channelTitle: string;
        thumbnailUrl: string;
        publishedAt: string;
      }>;
      nextPageToken?: string;
    };

    assert.equal(body.nextPageToken, "token_page_2");
    const firstItem = body.items[0]!;
    assert.ok(firstItem);
    assert.equal(firstItem.videoId, "dQw4w9WgXcQ");
    assert.equal(firstItem.title, "Rick Astley & 'Never Gonna Give You Up'");
    assert.equal(firstItem.channelTitle, 'Official "Rick" Channel');
    assert.equal(firstItem.thumbnailUrl, "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg");
  } finally {
    globalThis.fetch = originalFetch;
    env.YOUTUBE_DATA_API_KEY = originalKey;
    await stopServer(harness);
  }
});

test("GET /api/youtube/search returns 502 when upstream YouTube Data API fails", async () => {
  const originalKey = env.YOUTUBE_DATA_API_KEY;
  env.YOUTUBE_DATA_API_KEY = "test-mock-api-key";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request) => {
    const urlString = url.toString();
    if (urlString.includes("googleapis.com/youtube/v3/search")) {
      return new Response(JSON.stringify({ error: { code: 403, message: "Quota exceeded" } }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    return originalFetch(url);
  }) as typeof fetch;

  const harness = await startServer();
  try {
    const response = await fetch(`${harness.baseUrl}/api/youtube/search?q=music`);
    assert.equal(response.status, 502);

    const body = (await response.json()) as { error: { code: string; message: string } };
    assert.equal(body.error.code, "YOUTUBE_UPSTREAM_ERROR");
  } finally {
    globalThis.fetch = originalFetch;
    env.YOUTUBE_DATA_API_KEY = originalKey;
    await stopServer(harness);
  }
});
