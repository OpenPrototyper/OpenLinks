interface TwitterActivityProps {
  username: string;
  tweetIds: string[];
  profileUrl: string;
}

export default function TwitterActivity({ username, tweetIds, profileUrl }: TwitterActivityProps) {
  return (
    <div className="twitter-activity flex flex-col gap-3">
      {tweetIds.map((tweetId) => (
        <div key={tweetId} className="tweet-embed rounded-xl overflow-hidden">
          <iframe
            src={`https://platform.twitter.com/embed/Tweet.html?id=${tweetId}&theme=dark&dnt=true`}
            title="X Post"
            scrolling="no"
            frameBorder="0"
            allowTransparency={true}
            allowFullScreen={true}
            style={{ width: '100%', height: '550px', border: 'none' }}
          />
        </div>
      ))}

      <div className="pt-3 border-t border-[#262626]">
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
