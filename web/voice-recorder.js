(() => {
  "use strict";

  const maximumDurationMs = 120_000;

  class VoiceRecorder {
    constructor({ onState = () => {}, onReady = () => {}, onError = () => {} } = {}) {
      this.onState = onState;
      this.onReady = onReady;
      this.onError = onError;
      this.state = "idle";
      this.stream = null;
      this.recorder = null;
      this.chunks = [];
      this.timer = null;
      this.cancelled = false;
      this.startedAt = 0;
      this.durationMs = 0;
    }

    setState(state) {
      this.state = state;
      this.onState(state);
    }

    async start() {
      if (this.state !== "idle") return;
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        this.onError(new Error("Trình duyệt chưa hỗ trợ ghi âm. Hãy dùng trình duyệt hiện đại qua HTTPS hoặc localhost."));
        return;
      }

      this.cancelled = false;
      this.setState("requesting");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true }, video: false,
        });
        if (this.cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          this.reset();
          return;
        }

        this.stream = stream;
        const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"]
          .find((type) => MediaRecorder.isTypeSupported(type));
        this.recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
        this.chunks = [];
        this.recorder.ondataavailable = (event) => {
          if (event.data.size > 0) this.chunks.push(event.data);
        };
        this.recorder.onerror = (event) => {
          this.cancelled = true;
          this.onError(event.error || new Error("Ghi âm thất bại."));
          this.stop();
        };
        this.recorder.onstop = () => {
          const cancelled = this.cancelled;
          const durationMs = this.durationMs;
          const type = this.recorder?.mimeType || this.chunks[0]?.type || "application/octet-stream";
          const blob = new Blob(this.chunks, { type });
          this.reset();
          if (!cancelled && blob.size > 0) this.onReady({ blob, mimeType: type, durationMs });
        };
        this.startedAt = performance.now();
        this.recorder.start();
        this.setState("recording");
        this.timer = window.setTimeout(() => this.stop(), maximumDurationMs);
      } catch (error) {
        const cancelled = this.cancelled;
        this.reset();
        if (!cancelled) this.onError(error);
      }
    }

    stop() {
      window.clearTimeout(this.timer);
      if (this.recorder?.state === "recording") {
        this.durationMs = Math.max(0, performance.now() - this.startedAt);
        this.setState("stopping");
        this.recorder.stop();
        this.stream?.getTracks().forEach((track) => track.stop());
      }
    }

    cancel() {
      this.cancelled = true;
      if (this.state === "requesting") {
        this.setState("cancelling");
        return;
      }
      this.stop();
    }

    reset() {
      window.clearTimeout(this.timer);
      this.stream?.getTracks().forEach((track) => track.stop());
      this.stream = null;
      this.recorder = null;
      this.chunks = [];
      this.timer = null;
      this.startedAt = 0;
      this.durationMs = 0;
      this.setState("idle");
    }
  }

  window.MiniHermesVoiceRecorder = VoiceRecorder;
})();
