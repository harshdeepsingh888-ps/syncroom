import express, { type Request, type Response } from "express";
import { env } from "../config/env.js";

export type YouTubeSearchResultItem = {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  publishedAt: string;
};

export type YouTubeSearchResponse = {
  items: YouTubeSearchResultItem[];
  nextPageToken?: string;
};

type CacheEntry = {
  data: YouTubeSearchResponse;
  expiresAt: number;
};

const searchCache = new Map<string, CacheEntry>();
const CACHE_TTL_MILLISECONDS = 5 * 60 * 1_000;
const MAX_CACHE_ENTRIES = 100;

function cleanCache(): void {
  const now = Date.now();
  for (const [key, entry] of searchCache.entries()) {
    if (entry.expiresAt <= now) {
      searchCache.delete(key);
    }
  }

  if (searchCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = searchCache.keys().next().value;
    if (oldestKey !== undefined) {
      searchCache.delete(oldestKey);
    }
  }
}

export function decodeHtmlEntities(text: string): string {
  if (!text) {
    return "";
  }

  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export const youtubeRouter: express.Router = express.Router();

youtubeRouter.get("/search", async (request: Request, response: Response): Promise<void> => {
  const rawQuery = request.query.q;
  const pageToken =
    typeof request.query.pageToken === "string"
      ? request.query.pageToken.trim()
      : undefined;

  if (typeof rawQuery !== "string" || rawQuery.trim().length === 0) {
    response.status(400).json({
      error: {
        code: "INVALID_QUERY",
        message: "Search query parameter 'q' is required.",
      },
    });

    return;
  }

  const query = rawQuery.trim();

  if (query.length < 2) {
    response.status(400).json({
      error: {
        code: "QUERY_TOO_SHORT",
        message: "Search query must be at least 2 characters long.",
      },
    });

    return;
  }

  const apiKey = env.YOUTUBE_DATA_API_KEY;

  if (!apiKey || apiKey.length === 0) {
    response.status(503).json({
      error: {
        code: "YOUTUBE_API_KEY_MISSING",
        message: "YouTube Data API key is not configured on the server.",
      },
    });

    return;
  }

  cleanCache();

  const cacheKey = `${query.toLowerCase()}::${pageToken ?? ""}`;
  const cachedEntry = searchCache.get(cacheKey);

  if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
    response.status(200).json(cachedEntry.data);
    return;
  }

  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("maxResults", "8");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("key", apiKey);

  if (pageToken) {
    searchUrl.searchParams.set("pageToken", pageToken);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5_000);

  try {
    const upstreamResponse = await fetch(searchUrl.toString(), {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    clearTimeout(timeoutId);

    if (!upstreamResponse.ok) {
      request.log?.warn(
        {
          status: upstreamResponse.status,
          statusText: upstreamResponse.statusText,
        },
        "YouTube API search request returned non-OK status.",
      );

      response.status(502).json({
        error: {
          code: "YOUTUBE_UPSTREAM_ERROR",
          message: "The YouTube search service failed to respond.",
        },
      });

      return;
    }

    const rawData = (await upstreamResponse.json()) as {
      items?: Array<{
        id?: { kind?: string; videoId?: string };
        snippet?: {
          title?: string;
          channelTitle?: string;
          thumbnails?: {
            medium?: { url?: string };
            default?: { url?: string };
          };
          publishedAt?: string;
        };
      }>;
      nextPageToken?: string;
    };

    const items: YouTubeSearchResultItem[] = Array.isArray(rawData.items)
      ? rawData.items
          .filter(
            (item) =>
              item.id?.kind === "youtube#video" &&
              typeof item.id?.videoId === "string" &&
              item.id.videoId.length > 0,
          )
          .map((item) => ({
            videoId: item.id!.videoId!,
            title: decodeHtmlEntities(item.snippet?.title ?? ""),
            channelTitle: decodeHtmlEntities(item.snippet?.channelTitle ?? ""),
            thumbnailUrl:
              item.snippet?.thumbnails?.medium?.url ??
              item.snippet?.thumbnails?.default?.url ??
              "",
            publishedAt: item.snippet?.publishedAt ?? new Date().toISOString(),
          }))
      : [];

    const resultData: YouTubeSearchResponse = {
      items,
      ...(typeof rawData.nextPageToken === "string" &&
      rawData.nextPageToken.length > 0
        ? { nextPageToken: rawData.nextPageToken }
        : {}),
    };

    searchCache.set(cacheKey, {
      data: resultData,
      expiresAt: Date.now() + CACHE_TTL_MILLISECONDS,
    });

    response.status(200).json(resultData);
  } catch (error) {
    clearTimeout(timeoutId);

    request.log?.error(
      { err: error },
      "Error executing YouTube Data API fetch.",
    );

    response.status(502).json({
      error: {
        code: "YOUTUBE_UPSTREAM_ERROR",
        message: "Failed to connect to YouTube search service.",
      },
    });
  }
});
