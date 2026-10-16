import { globalIgnores } from "eslint/config";
import { defineConfigWithVueTs, vueTsConfigs } from "@vue/eslint-config-typescript";
import pluginVue from "eslint-plugin-vue";
import pluginVitest from "@vitest/eslint-plugin";
import pluginOxlint from "eslint-plugin-oxlint";
import skipFormatting from "eslint-config-prettier/flat";
import stylistic from "@stylistic/eslint-plugin";

const variableStatements = [
  "const",
  "let",
  "var",
  { selector: "ExportNamedDeclaration[declaration.type='VariableDeclaration']" },
];

// To allow more languages other than `ts` in `.vue` files, uncomment the following lines:
// import { configureVueProject } from '@vue/eslint-config-typescript'
// configureVueProject({ scriptLangs: ['ts', 'tsx'] })
// More info at https://github.com/vuejs/eslint-config-typescript/#advanced-setup

export default defineConfigWithVueTs(
  {
    name: "app/files-to-lint",
    files: ["**/*.{vue,ts,mts,tsx}"],
  },

  globalIgnores(["**/dist/**", "**/dist-ssr/**", "**/coverage/**"]),

  ...pluginVue.configs["flat/essential"],
  vueTsConfigs.recommended,

  {
    ...pluginVitest.configs.recommended,
    files: ["src/**/__tests__/*"],
  },

  ...pluginOxlint.buildFromOxlintConfigFile(".oxlintrc.json"),

  skipFormatting,
  {
    name: "app/statement-spacing",
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
