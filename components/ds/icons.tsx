/** Inline icons. Decorative by default (aria-hidden); label the control that holds them instead. */
type P = { size?: number; className?: string; stroke?: string };

const base = (size = 20) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", "aria-hidden": true as const, focusable: false as const });

export const IconPerson = ({ size, className, stroke = "currentColor" }: P) => (
  <svg {...base(size)} className={className} stroke={stroke} strokeWidth="2">
    <circle cx="12" cy="9" r="4" />
    <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
  </svg>
);

export const IconCheck = ({ size, className, stroke = "currentColor" }: P) => (
  <svg {...base(size)} className={className} stroke={stroke} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12l5 5L20 7" />
  </svg>
);

export const IconCross = ({ size, className, stroke = "currentColor" }: P) => (
  <svg {...base(size)} className={className} stroke={stroke} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const IconQuestion = ({ size, className, stroke = "currentColor" }: P) => (
  <svg {...base(size)} className={className} stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 9a3 3 0 1 1 4 2.8c-.7.3-1 1-1 1.7V15" />
    <path d="M12 19h.01" />
  </svg>
);

export const IconArrowRight = ({ size, className, stroke = "currentColor" }: P) => (
  <svg {...base(size)} className={className} stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export const IconArrowLeft = ({ size, className, stroke = "currentColor" }: P) => (
  <svg {...base(size)} className={className} stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
);

export const IconChevron = ({ size, className, stroke = "currentColor" }: P) => (
  <svg {...base(size)} className={className} stroke={stroke} strokeWidth="2.2" strokeLinecap="round">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export const IconUpload = ({ size, className, stroke = "currentColor" }: P) => (
  <svg {...base(size)} className={className} stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 16V4M6 10l6-6 6 6M4 20h16" />
  </svg>
);

export const IconShield = ({ size, className, stroke = "currentColor" }: P) => (
  <svg {...base(size)} className={className} stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);
