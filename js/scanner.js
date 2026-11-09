// Camera barcode scanner.
// Uses the browser's built-in BarcodeDetector where available (Chrome/Edge on
// Android, recent desktop Chrome) and falls back to the bundled ZXing library
// everywhere else (iPhone Safari, Firefox).

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];

let zxingPromise = null;
function loadZxing() {
  if (window.ZXing) return Promise.resolve(window.ZXing);
  zxingPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL('../vendor/zxing.min.js', import.meta.url).href;
    s.onload = () => resolve(window.ZXing);
    s.onerror = () => reject(new Error('Could not load the barcode reader.'));
    document.head.appendChild(s);
  });
  return zxingPromise;
}

async function nativeDetector() {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const supported = await window.BarcodeDetector.getSupportedFormats();
    const formats = FORMATS.filter((f) => supported.includes(f));
    if (!formats.length) return null;
    return new window.BarcodeDetector({ formats });
  } catch {
    return null;
  }
}

/**
 * Start scanning into `video`. Calls onDetect(code) once, then stops.
 * Returns a stop() function. Throws a friendly Error if the camera can't start.
 */
export async function startScanner(video, onDetect) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera access needs HTTPS and a browser that supports it. You can type the barcode instead.');
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch (e) {
    const msg = e.name === 'NotAllowedError'
      ? 'Camera permission was denied. Allow camera access in your browser settings, or type the barcode instead.'
      : `Could not start the camera (${e.message || e.name}).`;
    throw new Error(msg);
  }
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  video.muted = true;
  await video.play();

  let stopped = false;
  const stop = () => {
    stopped = true;
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };
  const found = (code) => {
    if (stopped) return;
    if (navigator.vibrate) navigator.vibrate(80);
    stop();
    onDetect(code);
  };

  const detector = await nativeDetector();
  if (detector) {
    const tick = async () => {
      if (stopped) return;
      try {
        if (video.readyState >= 2) {
          const codes = await detector.detect(video);
          if (codes.length) return found(codes[0].rawValue);
        }
      } catch { /* frame not ready */ }
      setTimeout(tick, 150);
    };
    tick();
  } else {
    const ZXing = await loadZxing();
    const hints = new Map();
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
      ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.UPC_A,
      ZXing.BarcodeFormat.UPC_E, ZXing.BarcodeFormat.CODE_128,
    ]);
    hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
    const reader = new ZXing.MultiFormatReader();
    reader.setHints(hints);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const tick = () => {
      if (stopped) return;
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (w && h) {
        // Decode the middle band of the frame (where the on-screen box is):
        // faster and more reliable than scanning the whole picture.
        const cropH = Math.round(h * 0.5);
        canvas.width = w;
        canvas.height = cropH;
        ctx.drawImage(video, 0, Math.round((h - cropH) / 2), w, cropH, 0, 0, w, cropH);
        try {
          const source = new ZXing.HTMLCanvasElementLuminanceSource(canvas);
          const bitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(source));
          const result = reader.decode(bitmap);
          if (result) return found(result.getText());
        } catch { /* no barcode in this frame */ }
      }
      setTimeout(tick, 120);
    };
    tick();
  }
  return stop;
}
