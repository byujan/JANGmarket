/**
 * Preparing photographs in the browser before they are sent.
 *
 * A phone photograph is several megabytes and far larger than any screen needs
 * it. Resizing here rather than on the server means the upload is small, the
 * server needs no image library, and the rows that land in Postgres stay the
 * size of a web image instead of the size of a camera sensor.
 */
export const MAX_PHOTOS = 6;
const MAX_EDGE = 1400;
const QUALITY = 0.72;

export type Photo = { dataUrl: string; name: string; bytes: number };

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("that file is not an image this browser can read"));
    image.src = src;
  });
}

/**
 * One file, scaled to fit inside MAX_EDGE and re-encoded as JPEG.
 *
 * Always JPEG, drawn onto white first: a PNG screenshot of a bicycle is many
 * times the size of the same picture as a photograph, and transparency on a
 * classified ad means a black hole wherever the page is dark.
 */
export async function prepare(file: File): Promise<Photo> {
  const image = await load(await readAsDataUrl(file));
  const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));

  const context = canvas.getContext("2d");
  if (!context) throw new Error("this browser would not give us a canvas to resize with");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL("image/jpeg", QUALITY);
  // Roughly: base64 carries three bytes in four characters.
  const bytes = Math.round((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75);
  return { dataUrl, name: file.name, bytes };
}
