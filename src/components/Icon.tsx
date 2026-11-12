export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    select: <path d="m5 3 14 9-7 1-3 7Z" />,
    pen: (
      <>
        <path d="m4 20 4-1L20 7a2.1 2.1 0 0 0-3-3L5 16Z" />
        <path d="m14 7 3 3M4 20l1-4" />
      </>
    ),
    rect: <rect x="4" y="4" width="16" height="16" rx="2" />,
    ellipse: <circle cx="12" cy="12" r="8" />,
    arrow: <path d="M4 19 19 4M8 4h11v11" />,
    text: (
      <>
        <path d="M5 5h14M12 5v15M8 20h8M5 5v3M19 5v3" />
      </>
    ),
    sticky: (
      <>
        <path d="M5 3h14a2 2 0 0 1 2 2v10l-6 6H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
        <path d="M15 21v-6h6" />
      </>
    ),
    hand: (
      <>
        <path d="M8 13V6a1.5 1.5 0 0 1 3 0v6-8a1.5 1.5 0 0 1 3 0v8-6a1.5 1.5 0 0 1 3 0v7-4a1.5 1.5 0 0 1 3 0v6c0 4-2 6-6 6h-1c-3 0-4-2-6-4l-3-4a1.5 1.5 0 0 1 2-2l2 2Z" />
      </>
    ),
    eraser: (
      <>
        <path d="m4 13 9-9a2 2 0 0 1 3 0l5 5a2 2 0 0 1 0 3l-8 8H9l-5-4a2 2 0 0 1 0-3Z" />
        <path d="m8 9 8 8M13 20h8" />
      </>
    ),
    undo: (
      <>
        <path d="m9 5-5 5 5 5" />
        <path d="M4 10h10a6 6 0 0 1 6 6v3" />
      </>
    ),
    redo: (
      <>
        <path d="m15 5 5 5-5 5" />
        <path d="M20 10H10a6 6 0 0 0-6 6v3" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    minus: <path d="M5 12h14" />,
    fit: (
      <>
        <path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5" />
        <rect x="8" y="8" width="8" height="8" rx="1" />
      </>
    ),
    share: (
      <>
        <path d="M12 15V3m-4 4 4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
      </>
    ),
    shield: (
      <>
        <path d="m12 3 8 3v6c0 4-5 8-8 9-3-1-8-5-8-9V6Z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="3" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
      </>
    ),
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="2" />
        <rect x="14" y="3" width="7" height="7" rx="2" />
        <rect x="3" y="14" width="7" height="7" rx="2" />
        <rect x="14" y="14" width="7" height="7" rx="2" />
      </>
    ),
    layers: (
      <>
        <path d="m12 3 10 5-10 5L2 8ZM2 12l10 5 10-5M2 16l10 5 10-5" />
      </>
    ),
    book: (
      <>
        <path d="M12 5c-3-2-7-2-10-1v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1ZM12 5v15" />
      </>
    ),
    chevron: <path d="m8 10 4 4 4-4" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    download: (
      <>
        <path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V4m-4 4 4-4 4 4M4 16v5h16v-5" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    leaf: (
      <>
        <path d="M20 3C8 1 2 8 5 16c8 6 17 0 15-13ZM5 20 16 9" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7h.01" />
      </>
    ),
    keyboard: (
      <>
        <rect x="2" y="5" width="20" height="14" rx="3" />
        <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 16h10" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.info}
    </svg>
  );
}
