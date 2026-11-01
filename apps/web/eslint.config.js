import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import root from "../../eslint.config.js";

export default tseslint.config(
  ...root,
  { ignores: ["public/**", "dev-dist/**", "android/**"] },
  reactHooks.configs.flat.recommended,
  {
    // El contenido editable se muestra como texto: nada de HTML inyectado (la CSP es solo una
    // defensa más). Ver docs/decisions.md, F6.
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: "No se inserta HTML: renderizá el contenido como texto.",
        },
      ],
    },
  },
  {
    files: ["**/*.test.{ts,tsx}"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
);
