import { useEffect, useState, type FormEvent } from "react";

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

export type YouTubeBrowserProps = {
  canControlPlayback: boolean;
  isVideoCommandPending: boolean;
  activeVideoId: string | null;
  onSelectVideo: (videoId: string) => void;
  onToggleUrlFallback?: () => void;
  onCloseDiscovery?: () => void;
};

export type CategoryOption = {
  label: string;
  query: string;
};

export const CATEGORIES: CategoryOption[] = [
  { label: "All", query: "popular videos" },
  { label: "Trending", query: "trending" },
  { label: "Music", query: "trending music" },
  { label: "Gaming", query: "trending gaming" },
  { label: "Movies", query: "movie trailers" },
  { label: "Education", query: "educational videos" },
  { label: "Sports", query: "sports highlights" },
];

function formatPublishDate(publishedAt: string): string {
  if (!publishedAt) {
    return "";
  }

  try {
    const date = new Date(publishedAt);
    if (isNaN(date.getTime())) {
      return "";
    }

    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export function YouTubeBrowser({
  canControlPlayback,
  isVideoCommandPending,
  activeVideoId,
  onSelectVideo,
  onToggleUrlFallback,
  onCloseDiscovery,
}: YouTubeBrowserProps) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>("All");
  const [items, setItems] = useState<YouTubeSearchResultItem[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  async function executeSearch(searchText: string, token?: string): Promise<void> {
    const trimmed = searchText.trim();
    if (trimmed.length < 2) {
      setError("Enter a search term with at least 2 characters.");
      return;
    }

    if (token) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
      setError(null);
      setHasSearched(true);
    }

    try {
      const searchParams = new URLSearchParams();
      searchParams.set("q", trimmed);
      if (token) {
        searchParams.set("pageToken", token);
      }

      const serverApiBase = import.meta.env.VITE_SERVER_URL ?? "";
      const requestUrl = `${serverApiBase}/api/youtube/search?${searchParams.toString()}`;

      const response = await fetch(requestUrl);

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Unable to connect to YouTube search API.");
      }

      const data = (await response.json()) as {
        items?: YouTubeSearchResultItem[];
        nextPageToken?: string;
        error?: { message?: string };
      };

      if (!response.ok) {
        throw new Error(
          data.error?.message ?? "Failed to fetch YouTube search results.",
        );
      }

      if (token) {
        setItems((prevItems) => [...prevItems, ...(data.items ?? [])]);
      } else {
        setItems(data.items ?? []);
      }

      setNextPageToken(data.nextPageToken);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "YouTube search request failed.";
      setError(message);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }

  useEffect(() => {
    executeSearch("popular videos");
  }, []);

  function handleFormSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const matchedCategory = CATEGORIES.find(
      (cat) => cat.query.toLowerCase() === query.trim().toLowerCase(),
    );

    setActiveCategory(matchedCategory ? matchedCategory.label : null);
    executeSearch(query);
  }

  function handleCategoryClick(category: CategoryOption): void {
    setActiveCategory(category.label);
    setQuery("");
    executeSearch(category.query);
  }

  function handleLoadMore(): void {
    if (!nextPageToken || isLoadingMore) {
      return;
    }

    const currentSearchTerm =
      query.trim() ||
      CATEGORIES.find((cat) => cat.label === activeCategory)?.query ||
      "popular videos";

    executeSearch(currentSearchTerm, nextPageToken);
  }

  return (
    <div className="youtube-browser">
      <div className="youtube-browser-header">
        <div className="youtube-browser-title">
          <span>Browse YouTube</span>
          <strong>Choose what the room watches next</strong>
        </div>

        <div className="youtube-browser-header-actions">
          {onToggleUrlFallback ? (
            <button
              type="button"
              className="text-button url-fallback-button"
              onClick={onToggleUrlFallback}
            >
              Paste URL instead
            </button>
          ) : null}

          {onCloseDiscovery ? (
            <button
              type="button"
              className="secondary-button close-discovery-button"
              onClick={onCloseDiscovery}
            >
              Close
            </button>
          ) : null}
        </div>
      </div>

      <form className="youtube-search-form" onSubmit={handleFormSubmit}>
        <div className="search-input-wrapper">
          <svg className="search-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
            <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
          </svg>

          <input
            type="text"
            className="youtube-search-input"
            value={query}
            placeholder="Search YouTube videos…"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveCategory(null);
              setError(null);
            }}
          />
        </div>

        <button
          type="submit"
          className="primary-button search-submit-button"
          disabled={isLoading || !query.trim()}
        >
          {isLoading ? "Searching…" : "Search"}
        </button>

        <div className="layout-toggle-group" role="group" aria-label="Layout view mode">
          <button
            type="button"
            className={`layout-toggle-button ${viewMode === "grid" ? "active" : ""}`}
            aria-label="Grid layout"
            aria-pressed={viewMode === "grid"}
            onClick={() => setViewMode("grid")}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M4 4h4v4H4zm6 0h4v4h-4zm6 0h4v4h-4zM4 10h4v4H4zm6 0h4v4h-4zm6 0h4v4h-4zM4 16h4v4H4zm6 0h4v4h-4zm6 0h4v4h-4z" />
            </svg>
          </button>

          <button
            type="button"
            className={`layout-toggle-button ${viewMode === "list" ? "active" : ""}`}
            aria-label="List layout"
            aria-pressed={viewMode === "list"}
            onClick={() => setViewMode("list")}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z" />
            </svg>
          </button>
        </div>
      </form>

      <div className="category-chips-row" role="tablist" aria-label="Video categories">
        {CATEGORIES.map((cat) => {
          const isActive = activeCategory === cat.label;
          return (
            <button
              type="button"
              className={`category-chip ${isActive ? "active" : ""}`}
              key={cat.label}
              role="tab"
              aria-selected={isActive}
              onClick={() => handleCategoryClick(cat)}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {!canControlPlayback ? (
        <p className="browser-authority-note">
          Only room Hosts and Moderators can select a video for everyone.
        </p>
      ) : null}

      {error ? <div className="browser-error-message">{error}</div> : null}

      {isLoading ? (
        <div className={`results-${viewMode}-grid`}>
          {Array.from({ length: 8 }).map((_, index) => (
            <div className="result-skeleton-card" key={`skeleton-${index}`}>
              <div className="skeleton-thumb" />
              <div className="skeleton-copy">
                <div className="skeleton-line title-line" />
                <div className="skeleton-line channel-line" />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {!isLoading && !hasSearched && !error ? (
        <div className="empty-results-state">
          <p>Search YouTube to browse videos.</p>
        </div>
      ) : null}

      {!isLoading && hasSearched && items.length === 0 && !error ? (
        <div className="empty-results-state">
          <p>No videos found for this search.</p>
        </div>
      ) : null}

      {!isLoading && items.length > 0 ? (
        <>
          <div className={`results-${viewMode}-grid`}>
            {items.map((item) => {
              const isSelected = item.videoId === activeVideoId;
              const formattedDate = formatPublishDate(item.publishedAt);

              return (
                <article
                  className={`youtube-result-card ${isSelected ? "selected" : ""}`}
                  key={item.videoId}
                >
                  <div
                    className={`result-thumbnail-shell ${
                      canControlPlayback && !isSelected && !isVideoCommandPending
                        ? "interactive"
                        : ""
                    }`}
                    tabIndex={canControlPlayback && !isSelected ? 0 : undefined}
                    role={canControlPlayback && !isSelected ? "button" : undefined}
                    aria-label={`Select ${item.title}`}
                    onClick={() => {
                      if (
                        canControlPlayback &&
                        !isSelected &&
                        !isVideoCommandPending
                      ) {
                        onSelectVideo(item.videoId);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (
                        (event.key === "Enter" || event.key === " ") &&
                        canControlPlayback &&
                        !isSelected &&
                        !isVideoCommandPending
                      ) {
                        event.preventDefault();
                        onSelectVideo(item.videoId);
                      }
                    }}
                  >
                    <img
                      src={item.thumbnailUrl}
                      alt={item.title}
                      loading="lazy"
                    />

                    {isSelected ? (
                      <span className="now-playing-chip">Now Playing</span>
                    ) : canControlPlayback ? (
                      <div className="thumbnail-hover-overlay">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                        <span>Watch Together</span>
                      </div>
                    ) : null}
                  </div>

                  <div className="result-details">
                    <h4 className="result-title" title={item.title}>
                      {item.title}
                    </h4>

                    <div className="result-meta">
                      <span className="result-channel">
                        {item.channelTitle}
                      </span>
                      {formattedDate ? (
                        <span className="result-date"> • {formattedDate}</span>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      className={`select-video-button ${isSelected ? "active" : ""}`}
                      disabled={
                        !canControlPlayback ||
                        isVideoCommandPending ||
                        isSelected
                      }
                      onClick={() => onSelectVideo(item.videoId)}
                    >
                      {isSelected
                        ? "Currently Playing"
                        : isVideoCommandPending
                          ? "Loading…"
                          : canControlPlayback
                            ? "Select Video"
                            : "Host Controlled"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          {nextPageToken ? (
            <div className="load-more-container">
              <button
                type="button"
                className="secondary-button load-more-button"
                disabled={isLoadingMore}
                onClick={handleLoadMore}
              >
                {isLoadingMore ? "Loading more…" : "Load More Videos"}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
