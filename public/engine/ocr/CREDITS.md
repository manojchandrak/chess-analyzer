# Text reader (OCR) files

Used by "Analyze from a picture" to read moves from a screenshot or photo, entirely in the browser.
Copied unmodified from the npm packages, which are licensed Apache-2.0:

| File | From |
| --- | --- |
| `worker.min.js` | [tesseract.js](https://github.com/naptha/tesseract.js) 7.0.0 (`dist/worker.min.js`) |
| `tesseract-core-simd-lstm.wasm.js` | [tesseract.js-core](https://github.com/naptha/tesseract.js-core) (`tesseract-core-simd-lstm.wasm.js`) |
| `eng.traineddata.gz` | [@tesseract.js-data/eng](https://github.com/naptha/tessdata) (`4.0.0_best_int`), the English model from [tesseract-ocr/tessdata_best](https://github.com/tesseract-ocr/tessdata_best) |
