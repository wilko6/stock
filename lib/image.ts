const MAX_DIMENSION = 800;
const QUALITY = 0.7;
const PDFJS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174";

export function compressImage(file: File): Promise<string> {
  if (file.type === "application/pdf") {
    return renderPdfToImage(file);
  }

  return compressImageFile(file);
}

function compressImageFile(file: File): Promise<string> {
  return new Promise<string>(
    (resolve: (value: string) => void, reject: (reason: unknown) => void) => {
      const url: string = URL.createObjectURL(file);
      const img: HTMLImageElement = new Image();

      img.onload = () => {
        const dataUrl: string = resizeToDataUrl(img, img.width, img.height);
        URL.revokeObjectURL(url);
        resolve(dataUrl);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load image"));
      };

      img.src = url;
    }
  );
}

function resizeToDataUrl(
  source: HTMLImageElement | HTMLCanvasElement,
  sourceWidth: number,
  sourceHeight: number
): string {
  let targetWidth: number = sourceWidth;
  let targetHeight: number = sourceHeight;

  if (sourceWidth > MAX_DIMENSION || sourceHeight > MAX_DIMENSION) {
    if (sourceWidth > sourceHeight) {
      targetWidth = MAX_DIMENSION;
      targetHeight = Math.round(sourceHeight * (MAX_DIMENSION / sourceWidth));
    } else {
      targetHeight = MAX_DIMENSION;
      targetWidth = Math.round(sourceWidth * (MAX_DIMENSION / sourceHeight));
    }
  }

  const canvas: HTMLCanvasElement = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx: CanvasRenderingContext2D | null = canvas.getContext("2d");

  if (ctx === null) {
    throw new Error("Failed to get canvas context");
  }

  ctx.drawImage(source, 0, 0, targetWidth, targetHeight);

  return canvas.toDataURL("image/jpeg", QUALITY);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pdfjsPromise: Promise<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadPdfJs(): Promise<any> {
  if (pdfjsPromise !== null) {
    return pdfjsPromise;
  }

  pdfjsPromise = new Promise((resolve, reject) => {
    const script: HTMLScriptElement = document.createElement("script");
    script.src = `${PDFJS_CDN}/pdf.min.js`;

    script.onload = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lib = (window as any).pdfjsLib;

      if (lib === undefined) {
        reject(new Error("pdfjsLib not found on window"));
        return;
      }

      lib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/pdf.worker.min.js`;
      resolve(lib);
    };

    script.onerror = () => {
      script.remove();
      pdfjsPromise = null;
      reject(new Error("Failed to load pdf.js"));
    };

    document.head.appendChild(script);
  });

  return pdfjsPromise;
}

async function renderPdfToImage(file: File): Promise<string> {
  const arrayBuffer: ArrayBuffer = await file.arrayBuffer();
  const pdfjsLib = await loadPdfJs();

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);

  const scale: number =
    MAX_DIMENSION / Math.max(page.view[2] as number, page.view[3] as number);
  const viewport = page.getViewport({ scale });

  const canvas: HTMLCanvasElement = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const ctx: CanvasRenderingContext2D | null = canvas.getContext("2d");

  if (ctx === null) {
    throw new Error("Failed to get canvas context");
  }

  await page.render({ canvasContext: ctx, viewport }).promise;

  return canvas.toDataURL("image/jpeg", QUALITY);
}
