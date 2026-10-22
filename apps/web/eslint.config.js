import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import root from "../../eslint.config.js";

export default tseslint.config(
  ...root,
  { ignores: ["public/**", "dev-dist/**", "android/**"] },
  reactHooks.configs.flat.recommended,
  {
    files: ["**/*.test.{ts,tsx}"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
);
