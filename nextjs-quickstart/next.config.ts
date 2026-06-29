import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@namoidhq/js", "@namoidhq/react"],
};

export default config;
