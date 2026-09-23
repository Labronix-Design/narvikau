import AppKit
import Foundation
import Vision

guard CommandLine.arguments.count == 2 else {
  fputs("Usage: decode-qr.swift <png-path>\n", stderr)
  exit(64)
}

let path = CommandLine.arguments[1]
guard let image = NSImage(contentsOfFile: path),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
  fputs("Unable to read QR image\n", stderr)
  exit(65)
}

let request = VNDetectBarcodesRequest()
request.symbologies = [.qr]
let handler = VNImageRequestHandler(cgImage: cgImage)

do {
  try handler.perform([request])
  let payloads = (request.results ?? []).compactMap(\.payloadStringValue)
  for payload in payloads {
    print(payload)
  }
} catch {
  fputs("Unable to decode QR image\n", stderr)
  exit(66)
}
