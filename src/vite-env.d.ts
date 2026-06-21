declare module "*.svg" {
  const content: string;
  export default content;
}

declare module "*.css";

interface ImportMetaEnv {
  readonly VITE_STRIPE_PUBLIC_KEY: string;
  readonly VITE_CLOUDINARY_CLOUD_NAME: string;
  readonly VITE_CLOUDINARY_UPLOAD_PRESET: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
