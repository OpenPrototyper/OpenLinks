import { useEffect, useRef, useState } from 'react';

interface TwitterActivityProps {
  username: string;
  tweetIds: string[];
  profileUrl: string;
}

declare global {
  interface Window {
    twttr?: {
      widgets: {
        load: (element?: HTMLElement) => void;
        createTweet: (
          tweetId: string,
          element: HTMLElement,
          options?: object
        ) => Promise<HTMLElement>;
      };
    };
  }
}

export default function TwitterActivity({ username, tweetIds, profileUrl }: TwitterActivityProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Load Twitter widget script if not already loaded
    const loadTwitterScript = () => {
      return new Promise<void>((resolve, reject) => {
        if (window.twttr) {
          resolve();
          return;
        }

        const script = document.createElement('script');
        script.src = 'https://platform.twitter.com/widgets.js';
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject();
        document.head.appendChild(script);
      });
    };

    const embedTweets = async () => {
      try {
        await loadTwitterScript();

        if (!containerRef.current || !window.twttr) return;

        // Clear container
        containerRef.current.innerHTML = '';

        // Embed each tweet
        for (const tweetId of tweetIds) {
          const tweetContainer = document.createElement('div');
          tweetContainer.className = 'tweet-embed';
          containerRef.current.appendChild(tweetContainer);

          await window.twttr.widgets.createTweet(tweetId, tweetContainer, {
            theme: 'dark',
            dnt: true,
            align: 'center',
          });
        }

        setLoaded(true);
      } catch (err) {
        console.error('Failed to load tweets:', err);
        setError(true);
      }
    };

    embedTweets();
  }, [tweetIds]);

  if (error) {
    return (
      <div className="text-center py-4">
        <p className="text-[#525252] text-sm">Failed to load tweets</p>
        <a
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#1da1f2] text-sm hover:underline mt-2 inline-block"
        >
          View on X →
        </a>
      </div>
    );
  }

  return (
    <div className="twitter-activity">
      {!loaded && (
        <div className="flex flex-col gap-3">
          {tweetIds.map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="bg-[#1a1a1a] rounded-xl p-4 border border-[#262626]">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-[#262626]"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-[#262626] rounded w-24 mb-1"></div>
                    <div className="h-3 bg-[#262626] rounded w-16"></div>
                  </div>
                </div>
                <div className="h-4 bg-[#262626] rounded w-full mb-2"></div>
                <div className="h-4 bg-[#262626] rounded w-3/4"></div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        ref={containerRef}
        className={`flex flex-col gap-3 ${!loaded ? 'hidden' : ''}`}
      />

      <div className="mt-3 pt-3 border-t border-[#262626]">
        <a
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 text-sm text-[#1da1f2] hover:text-[#1a8cd8] transition-colors"
        >
          <span>View more on X</span>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>
    </div>
  );
}
