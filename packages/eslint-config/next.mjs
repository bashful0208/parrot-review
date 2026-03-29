import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

import baseConfig from "./base.mjs";

const nextConfig = [...baseConfig, ...nextVitals, ...nextTs];

export default nextConfig;
