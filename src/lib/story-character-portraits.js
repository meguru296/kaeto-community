import sharp from 'sharp';

const fault = (message, status) => Object.assign(new Error(message), { status });

export class StoryCharacterPortraits {
  constructor(fetchImage) {
    this.fetchImage = fetchImage;
    this.pending = new Map();
    this.pictures = new Map();
    this.size = 0;
  }

  async get(character, showOriginal) {
    if (!character.image) throw fault('这个角色暂无图片', 404);
    const masked = character.sensitive && (!showOriginal || character.maskOnly);
    const key = character.image + '|' + masked;
    const cached = this.pictures.get(key);
    if (cached) return cached;
    if (this.pending.has(key)) return this.pending.get(key);
    if (this.pending.size >= 16) throw fault('角色图片加载较多，请稍后重试', 429);

    const task = this.download(character.image, masked).then(bytes => {
      this.pictures.set(key, bytes);
      this.size += bytes.length;
      while (this.size > 12 * 1024 * 1024 || this.pictures.size > 384) {
        const first = this.pictures.keys().next().value;
        this.size -= this.pictures.get(first).length;
        this.pictures.delete(first);
      }
      return bytes;
    });
    this.pending.set(key, task);
    try { return await task; } finally { this.pending.delete(key); }
  }

  async download(url, masked) {
    const response = await this.fetchImage(url, { redirect: 'error', signal: AbortSignal.timeout(6500) });
    if (!response.ok || !/^image\//i.test(response.headers.get('content-type') || '')) {
      await response.body?.cancel();
      throw fault('角色图片暂不可用', 404);
    }
    const reader = response.body?.getReader();
    if (!reader) throw fault('角色图片暂不可用', 404);
    const chunks = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4 * 1024 * 1024) {
          await reader.cancel();
          throw fault('角色图片过大', 404);
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const dimension = masked ? 16 : 320;
    const small = await sharp(Buffer.concat(chunks, size), { limitInputPixels: 16_000_000 })
      .rotate().resize(dimension, dimension, { fit: 'inside', withoutEnlargement: true }).webp().toBuffer();
    return masked ? sharp(small).resize(320, 320, { fit: 'inside', kernel: 'nearest' }).blur(3).webp().toBuffer() : small;
  }

  async stop() {
    await Promise.allSettled(this.pending.values());
  }
}
