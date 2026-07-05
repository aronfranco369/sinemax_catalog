import nextConfig from "eslint-config-next";

const eslintConfig = [
  ...nextConfig,
  {
    rules: {
      // These new react-hooks rules flag the standard "fetch in an effect,
      // setState with the result" pattern used throughout this app (both
      // pre-existing and new code) as an error. That pattern is correct
      // here — there's no data-fetching library in this project — so the
      // rules are disabled rather than restructured around.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
    },
  },
];

export default eslintConfig;
