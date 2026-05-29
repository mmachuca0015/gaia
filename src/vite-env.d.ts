declare module "*.svg" {
  const content: string;
  export default content;
}

declare module "*.css";

interface ImportMetaEnv {
  readonly VITE_STRIPE_PUBLIC_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
