// Simple line icons, one per gig category. Decorative only (the category name is always shown as text).
const PATHS = {
  design: <path d="M12 3l6 9-6 9-6-9 6-9zM12 3v11M12 14a1.6 1.6 0 100 .01" />,
  writing: <path d="M4 6h16M4 11h16M4 16h9M17 15l3 3-4 1 1-4z" />,
  development: <path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />,
  marketing: <path d="M3 11v2a1 1 0 001 1h3l6 4V6L7 10H4a1 1 0 00-1 1zM16.5 9a4 4 0 010 6M19 6.5a7.5 7.5 0 010 11" />,
  video: <path d="M4 6h11a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2zM17 10l5-3v10l-5-3z" />,
  tutoring: <path d="M2 9l10-5 10 5-10 5-10-5zM6 11.5V16c0 1.4 2.7 3 6 3s6-1.6 6-3v-4.5M22 9v6" />,
  admin: <path d="M9 6h11M9 12h11M9 18h11M3.5 6l1.5 1.5L7.5 5M3.5 12l1.5 1.5L7.5 11M3.5 18l1.5 1.5L7.5 17" />,
  other: <path d="M12 3l2.4 6.1L21 12l-6.6 2.9L12 21l-2.4-6.1L3 12l6.6-2.9L12 3z" />,
};

export default function CategoryIcon({ category }) {
  return (
    <svg className="gig-icon-svg" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[category] ?? PATHS.other}
    </svg>
  );
}
