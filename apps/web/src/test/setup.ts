import "@testing-library/jest-dom/vitest";

// Sin red en los tests: el contenido público cae a los textos originales.
window.fetch = (() => Promise.reject(new Error("sin red en los tests"))) as typeof window.fetch;

// jsdom no implementa scrollTo.
window.scrollTo = (() => undefined) as typeof window.scrollTo;
