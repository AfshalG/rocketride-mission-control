import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The RocketRide SDK is a Node library (websockets/fs); keep it external to the
  // server bundle so it loads correctly at runtime in the route handler.
  serverExternalPackages: ["rocketride"],
};

export default nextConfig;
