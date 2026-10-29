# OCR models

Used by `ocr.js` for the card scanner.

| File | What | Source |
|---|---|---|
| `en_PP-OCRv3_det_infer.onnx` | Text detection (finds text lines), 2.4 MB | PaddleOCR PP-OCRv3 English det, ONNX conversion by [RapidOCR](https://huggingface.co/SWHL/RapidOCR) (via npm `paddle-ocr-onnx-models@0.2.0`) |
| `PP-OCRv6_small_rec.onnx` | Text recognition (reads a line), 21 MB | Official [PaddlePaddle/PP-OCRv6_small_rec_onnx](https://huggingface.co/PaddlePaddle/PP-OCRv6_small_rec_onnx) `inference.onnx` |
| `ppocrv6_dict.txt` | Character list for the recognition model | `PostProcess.character_dict` from that repo's `inference.yml` |

All are from [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR), licensed
Apache-2.0.

Why this combination: in a benchmark of synthetic card name strips (blur,
glare, tilt, small text) it read the most words. The PP-OCRv6 detectors were
worse at very small text, and the v6 tiny recognizer (4.5 MB) was weaker on
small/low-resolution names.
