// Subida directa a Cloudinary con un upload preset sin firma. Va con
// XMLHttpRequest y no con fetch porque fetch no reporta el progreso de la
// subida, y sin eso no hay barra que enseñar.
//
// Falla con un Error con mensaje para la pantalla: antes un rechazo de
// Cloudinary (por ejemplo, las variables con comillas en Render) devolvia
// `undefined` y la imagen simplemente no aparecia.
export function uploadImage(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    form.append("upload_preset", import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET);

    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/image/upload`,
    );

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      let data: { secure_url?: string; error?: { message?: string } } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // respuesta que no es JSON: cae al mensaje generico
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.secure_url) {
        resolve(data.secure_url);
      } else {
        console.error("Cloudinary:", xhr.status, data.error?.message);
        reject(new Error("No pudimos subir la imagen. Intenta con otra."));
      }
    };

    xhr.onerror = () =>
      reject(new Error("No pudimos subir la imagen. Revisa tu conexión."));

    xhr.send(form);
  });
}
