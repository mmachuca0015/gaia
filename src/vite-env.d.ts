declare module "*.svg" {
  const content: string;
  export default content;
}

declare module "*.css";

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_STRIPE_PUBLIC_KEY: string;
  // Puede venir vacia: la landing tiene un camino alterno mientras no exista
  // la pagina de reservas de Google.
  readonly VITE_DEMO_BOOKING_URL?: string;
  readonly VITE_CLOUDINARY_CLOUD_NAME: string;
  readonly VITE_CLOUDINARY_UPLOAD_PRESET: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
