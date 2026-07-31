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
  { label: "Trending", query: "trending videos" },
  { label: "Music", query: "official music videos" },
  { label: "Comedy", query: "stand up comedy" },
  { label: "Gaming", query: "gaming highlights" },
  { label: "Movies", query: "movie trailers" },
  { label: "Sports", query: "sports highlights" },
  { label: "Technology", query: "technology reviews" },
  { label: "Learning", query: "educational videos" },
  { label: "Podcasts", query: "popular podcasts" },
  { label: "Travel", query: "travel documentaries" },
  { label: "Food", query: "food and cooking videos" },
  { label: "Animation", query: "animation videos" },
  { label: "Live", query: "live streams" },
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
  const [participantNotice, setParticipantNotice] = useState<string | null>(null);

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

  function triggerParticipantNotice(): void {
    setParticipantNotice("Shared playback is controlled by the Host or a Moderator.");
    window.setTimeout(() => {
      setParticipantNotice(null);
    }, 3200);
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

      <div className="browser-authority-banner" role="status" aria-live="polite">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
        </svg>
        <span>
          {canControlPlayback
            ? "Choose a video to play it for everyone in the room."
            : "Browse freely. The Host or a Moderator chooses what plays for everyone."}
        </span>
      </div>

      {participantNotice ? (
        <div className="participant-toast" role="status" aria-live="polite">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
          </svg>
          <span>{participantNotice}</span>
        </div>
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

              const isHostOrMod = canControlPlayback;
              const isInteractive = isHostOrMod && !isSelected && !isVideoCommandPending;

              return (
                <article
                  className={`youtube-result-card ${isSelected ? "selected" : ""} ${
                    isInteractive ? "interactive" : ""
                  } ${!isHostOrMod ? "participant-browsable" : ""}`}
                  key={item.videoId}
                  tabIndex={isInteractive ? 0 : undefined}
                  role={isInteractive ? "button" : undefined}
                  aria-label={
                    isSelected
                      ? `${item.title} is currently playing`
                      : isInteractive
                        ? `Play ${item.title} for the room`
                        : item.title
                  }
                  onClick={() => {
                    if (isInteractive) {
                      onSelectVideo(item.videoId);
                    } else if (!isHostOrMod && !isSelected) {
                      triggerParticipantNotice();
                    }
                  }}
                  onKeyDown={(event) => {
                    if (
                      isInteractive &&
                      (event.key === "Enter" || event.key === " ")
                    ) {
                      event.preventDefault();
                      onSelectVideo(item.videoId);
                    }
                  }}
                >
                  <div className="result-thumbnail-shell">
                    <img
                      src={item.thumbnailUrl}
                      alt={item.title}
                      loading="lazy"
                    />

                    {isSelected ? (
                      <span className="now-playing-chip">Now Playing</span>
                    ) : isHostOrMod ? (
                      <div className="thumbnail-hover-overlay">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                        <span>Play for Room</span>
                      </div>
                    ) : (
                      <span
                        className="thumbnail-host-only-badge"
                        title="Shared playback is controlled by Host or Moderator"
                      >
                        <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor" aria-hidden="true">
                          <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
                        </svg>
                        <span>Host / Mod</span>
                      </span>
                    )}
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

                    {isSelected ? (
                      <span className="select-video-badge active">
                        Currently Playing
                      </span>
                    ) : null}
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
