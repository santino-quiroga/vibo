import type { NextConfig } from "next";

// Headers de seguridad estáticos (SDD sección 7.2).
//
// El Content-Security-Policy NO está acá: se arma por request en el proxy
// (src/proxy.ts), porque desde el sprint 6 lleva un nonce por request para
// endurecer script-src. Estos otros headers sí son fijos y viven acá.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  // HSTS: en Vercel todo es HTTPS igual, esto evita el primer request en claro.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
