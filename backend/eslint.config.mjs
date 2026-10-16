import tseslint from "typescript-eslint";
import stylistic from "@stylistic/eslint-plugin";

const variableStatements = [
  "const",
  "let",
  "var",
  { selector: "ExportNamedDeclaration[declaration.type='VariableDeclaration']" },
];

export default tseslint.config(
  { ignores: ["dist/**", "src/generated/**"] },
  ...tseslint.configs.recommended,
  { rules: { "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }] } },
  {
    plugins: { "@stylistic": stylistic },
    rules: {
      "@stylistic/padding-line-between-statements": [
        "error",
        { blankLine: "always", prev: "import", next: "*" },
        { blankLine: "any", prev: "import", next: "import" },
        { blankLine: "always", prev: "*", next: variableStatements },
        { blankLine: "always", prev: variableStatements, next: "*" },
        {
          blankLine: "always",
          prev: "*",
          next: ["function", "class", "interface", "type", "export", "return"],
        },
        {
          blankLine: "always",
          prev: ["function", "class", "interface", "type", "export"],
          next: "*",
        },
        { blankLine: "any", prev: variableStatements, next: variableStatements },
      ],
    },
  },
);
