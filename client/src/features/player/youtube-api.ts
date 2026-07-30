let youtubeApiPromise: Promise<typeof YT> | undefined;

declare global {
  interface Window {
    YT: typeof YT;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export async function loadYouTubeApi(): Promise<typeof YT> {
  if (window.YT?.Player) {
    return window.YT;
  }

  if (youtubeApiPromise) {
    return youtubeApiPromise;
  }

  youtubeApiPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.youtube.com/iframe_api"]',
    );

    if (!existingScript) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;

      script.onerror = () => {
        reject(new Error("Failed to load YouTube IFrame API."));
      };

      document.head.appendChild(script);
    }

    window.onYouTubeIframeAPIReady = () => {
      resolve(window.YT);
    };
  });

  return youtubeApiPromise;
}
