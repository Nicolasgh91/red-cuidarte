import "@testing-library/jest-dom/vitest";

// jsdom no implementa scrollTo.
window.scrollTo = (() => undefined) as typeof window.scrollTo;
