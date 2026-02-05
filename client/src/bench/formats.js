export const FORMATS = [
  { id: "orgjson", label: "org.json", implemented: true },
  { id: "jacksonstream", label: "Jackson Streaming", implemented: true },
  { id: "flexbuffers", label: "FlexBuffers", implemented: true },
  { id: "flatbuffers", label: "FlatBuffers", implemented: true },
  { id: "messagepack", label: "MessagePack", implemented: true },
  { id: "cbor", label: "CBOR", implemented: true },
  { id: "arrow", label: "Apache Arrow", implemented: true }
];

export const SIZE_PRESETS = [
  { id: "small", label: "Small (1k)", value: "small" },
  { id: "medium", label: "Medium (10k)", value: "medium" },
  { id: "large", label: "Large (50k)", value: "large" }
];
