import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import { loadYouTubeApi } from "./youtube-api";

export type YouTubePlayerHandle = {
  play: () => void;
  pause: () => void;
  seekTo: (positionSeconds: number) => void;
  loadVideo: (
    videoId: string,
    startSeconds?: number,
  ) => void;
  getCurrentTime: () => number;
  getPlayerState: () => YT.PlayerState | null;

  // NEW
  getDuration: () => number;
};


type YouTubePlayerProps = {
  videoId: string;
  startSeconds?: number;
  className?: string;
  controls?: boolean;
  onReady?: () => void;
  onStateChange?: (
    state: YT.PlayerState,
  ) => void;
  onError?: (errorCode: number) => void;
};

type PlayerCallbacks = Pick<
  YouTubePlayerProps,
  "onReady" | "onStateChange" | "onError"
>;

export const YouTubePlayer = forwardRef<
  YouTubePlayerHandle,
  YouTubePlayerProps
>(function YouTubePlayer(
  {
    videoId,
    startSeconds = 0,
    className,
    controls = false,
    onReady,
    onStateChange,
    onError,
  },
  forwardedRef,
) {
  const containerRef =
    useRef<HTMLDivElement | null>(null);

  const playerRef =
    useRef<YT.Player | null>(null);

  const callbacksRef =
    useRef<PlayerCallbacks>({
      onReady,
      onStateChange,
      onError,
    });

  const initialStartSecondsRef =
    useRef(startSeconds);

  const [isReady, setIsReady] =
    useState(false);

  const [
    initializationError,
    setInitializationError,
  ] = useState<string | null>(null);

  callbacksRef.current = {
    onReady,
    onStateChange,
    onError,
  };

  useImperativeHandle(
    forwardedRef,
    () => ({
      play() {
        playerRef.current?.playVideo();
      },

      pause() {
        playerRef.current?.pauseVideo();
      },

      seekTo(positionSeconds) {
        if (
          !Number.isFinite(positionSeconds)
        ) {
          return;
        }

        playerRef.current?.seekTo(
          Math.max(0, positionSeconds),
          true,
        );
      },

      loadVideo(
        nextVideoId,
        nextStartSeconds = 0,
      ) {
        const normalizedVideoId =
          nextVideoId.trim();

        if (!normalizedVideoId) {
          return;
        }

        playerRef.current?.loadVideoById({
          videoId: normalizedVideoId,
          startSeconds: Math.max(
            0,
            nextStartSeconds,
          ),
        });
      },

      getCurrentTime() {
        return (
          playerRef.current?.getCurrentTime() ??
          0
        );
      },

      getPlayerState() {
        return (
          playerRef.current?.getPlayerState() ??
          null
        );
      },
      getDuration() {
  return (
    playerRef.current?.getDuration() ?? 0
  );
},
    }),
    [],
  );

  useEffect(() => {
    let cancelled = false;

    async function initializePlayer(): Promise<void> {
      if (
        playerRef.current ||
        !containerRef.current
      ) {
        return;
      }

      setInitializationError(null);
      setIsReady(false);

      try {
        const youtube =
          await loadYouTubeApi();

        if (
          cancelled ||
          !containerRef.current
        ) {
          return;
        }

        playerRef.current =
          new youtube.Player(
            containerRef.current,
            {
              videoId,

              playerVars: {
                autoplay: 0,
                controls: controls ? 1 : 0,
                disablekb: controls ? 0 : 1,
                enablejsapi: 1,
                playsinline: 1,
                rel: 0,
                start: Math.floor(
                  Math.max(
                    0,
                    initialStartSecondsRef.current,
                  ),
                ),
              },

              events: {
                onReady: () => {
                  if (cancelled) {
                    return;
                  }

                  const initialPosition =
                    Math.max(
                      0,
                      initialStartSecondsRef.current,
                    );

                  if (initialPosition > 0) {
                    playerRef.current?.seekTo(
                      initialPosition,
                      true,
                    );
                  }

                  setIsReady(true);

                  callbacksRef.current.onReady?.();
                },

                onStateChange: (event) => {
                  callbacksRef.current.onStateChange?.(
                    event.data,
                  );
                },

                onError: (event) => {
                  callbacksRef.current.onError?.(
                    event.data,
                  );
                },
              },
            },
          );
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message =
          error instanceof Error
            ? error.message
            : "Unable to initialize the YouTube player.";

        setInitializationError(message);
        setIsReady(false);
      }
    }

    void initializePlayer();

    return () => {
      cancelled = true;

      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [controls]);

  useEffect(() => {
    if (
      !isReady ||
      !playerRef.current ||
      !videoId.trim()
    ) {
      return;
    }

    playerRef.current.cueVideoById({
      videoId,
      startSeconds: Math.max(
        0,
        startSeconds,
      ),
    });
  }, [videoId, isReady]);

  if (initializationError) {
    return (
      <div
        className={className}
        role="alert"
      >
        <p>
          Unable to load the YouTube player.
        </p>

        <p>{initializationError}</p>
      </div>
    );
  }

  return (
    <div className={className}>
      {!isReady ? (
        <div aria-live="polite">
          <p>
            Loading YouTube player...
          </p>
        </div>
      ) : null}

      <div ref={containerRef} />
    </div>
  );
});