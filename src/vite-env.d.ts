declare module "*.svg" {
  const content: string;
  export default content;
}

declare module "*.css";

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_STRIPE_PUBLIC_KEY: string;
  // WhatsApp de contacto de la landing (solo digitos, con lada de pais). Puede
  // venir vacia: entonces la seccion pide el correo para la waitlist.
  readonly VITE_WHATSAPP_NUMBER?: string;
  readonly VITE_CLOUDINARY_CLOUD_NAME: string;
  readonly VITE_CLOUDINARY_UPLOAD_PRESET: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
