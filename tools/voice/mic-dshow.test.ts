/**
 * Dua format daftar perangkat ffmpeg. Kasus nyata 19 Sep 2026: mic terpasang di
 * PC guru, app bilang "tidak ada perangkat mic yang terbaca" - karena format
 * BARU tertinggal saat logikanya disalin dari PowerShell ke JavaScript.
 */
import { describe, expect, it } from "vitest";
// @ts-expect-error - modul JS polos
import { uraiMicDshow, pilihMic } from "./mic-dshow.mjs";

const LAMA = [
  '[dshow @ 000001] DirectShow video devices (some may be both video and audio devices)',
  '[dshow @ 000001]  "Integrated Camera"',
  '[dshow @ 000001]     Alternative name "@device_pnp_\\\\?\\usb#vid_1"',
  '[dshow @ 000001] DirectShow audio devices',
  '[dshow @ 000001]  "Microphone (Realtek(R) Audio)"',
  '[dshow @ 000001]     Alternative name "@device_cm_{33D9A762}\\wave_{AAA}"',
  '[dshow @ 000001]  "Mikrofon Clip-On (USB Audio Device)"',
  '[dshow @ 000001]     Alternative name "@device_cm_{33D9A762}\\wave_{BBB}"',
  "dummy: Immediate exit requested",
].join("\r\n");

const BARU = [
  '[dshow @ 0000021] "Integrated Camera" (video)',
  '[dshow @ 0000021]   Alternative name "@device_pnp_\\\\?\\usb#vid_1"',
  '[dshow @ 0000021] "Microphone (Realtek(R) Audio)" (audio)',
  '[dshow @ 0000021]   Alternative name "@device_cm_{33D9A762}\\wave_{AAA}"',
  '[dshow @ 0000021] "Mikrofon Clip-On (USB Audio Device)" (audio)',
  '[dshow @ 0000021]   Alternative name "@device_cm_{33D9A762}\\wave_{BBB}"',
  "Error opening input file dummy.",
].join("\r\n");

describe("uraiMicDshow", () => {
  it("format LAMA (judul bagian) - bawaan ImageMagick 7.1.0", () => {
    expect(uraiMicDshow(LAMA)).toEqual([
      "Microphone (Realtek(R) Audio)",
      "Mikrofon Clip-On (USB Audio Device)",
    ]);
  });

  it("format BARU (jenis di ujung baris) - yang gagal di PC guru 19 Sep", () => {
    expect(uraiMicDshow(BARU)).toEqual([
      "Microphone (Realtek(R) Audio)",
      "Mikrofon Clip-On (USB Audio Device)",
    ]);
  });

  it("kamera TIDAK dianggap mic, di kedua format", () => {
    expect(uraiMicDshow(LAMA)).not.toContain("Integrated Camera");
    expect(uraiMicDshow(BARU)).not.toContain("Integrated Camera");
  });

  it("kurung di dalam NAMA mic tidak dikira jenis perangkat", () => {
    // Nama kamera ini berisi kata "audio" di dalam kurung - tapi jenisnya video.
    const t = '[dshow @ 1] "Webcam (with audio)" (video)';
    expect(uraiMicDshow(t)).toEqual([]);
  });

  it("baris Alternative name tidak pernah jadi mic", () => {
    for (const m of [...uraiMicDshow(LAMA), ...uraiMicDshow(BARU)]) {
      expect(m.startsWith("@device")).toBe(false);
    }
  });

  it("format lama tanpa mic: jawabannya kosong, tidak dicari ulang di format baru", () => {
    const t = [
      "[dshow @ 1] DirectShow video devices",
      '[dshow @ 1]  "Integrated Camera"',
      "[dshow @ 1] DirectShow audio devices",
      "[dshow @ 1] Could not enumerate audio only devices (or none found).",
    ].join("\n");
    expect(uraiMicDshow(t)).toEqual([]);
  });

  it("keluaran kosong / bukan teks tidak meledak", () => {
    expect(uraiMicDshow("")).toEqual([]);
    expect(uraiMicDshow(undefined as unknown as string)).toEqual([]);
  });
});

// Keluaran ASLI dari PC guru, 19 Sep 2026 - disalin apa adanya, bukan dikarang.
// Perhatikan dua hal yang tidak ada di contoh buatan: awalan baris "[in#0 @ ...]"
// (bukan "[dshow @ ...]"), dan Stereo Mix yang muncul SEBELUM mic sungguhan.
const PC_GURU_19_SEP = [
  "[in#0 @ 0000019662ea32c0] Could not enumerate video devices (or none found).",
  '[in#0 @ 0000019662ea32c0] "Stereo Mix (Realtek High Definition Audio)" (audio)',
  '[in#0 @ 0000019662ea32c0]   Alternative name "@device_cm_{33D9A762-90C8-11D0-BD43-00A0C911CE86}\\wave_{37D53D40-50B6-4950-85BA-9E2AA10B3FC9}"',
  '[in#0 @ 0000019662ea32c0] "Microphone (soundtech)" (audio)',
  '[in#0 @ 0000019662ea32c0]   Alternative name "@device_cm_{33D9A762-90C8-11D0-BD43-00A0C911CE86}\\wave_{C48A2CD6-0080-40E1-9E77-F26A70FD4F45}"',
  "Error opening input file dummy.",
].join("\r\n");

describe("keluaran ASLI PC guru 19 Sep", () => {
  it("kedua perangkat audio terbaca, awalan [in#0] tidak mengganggu", () => {
    expect(uraiMicDshow(PC_GURU_19_SEP)).toEqual([
      "Stereo Mix (Realtek High Definition Audio)",
      "Microphone (soundtech)",
    ]);
  });

  it("yang DIPILIH adalah mic soundtech, BUKAN Stereo Mix yang muncul duluan", () => {
    expect(pilihMic(uraiMicDshow(PC_GURU_19_SEP))).toBe("Microphone (soundtech)");
  });
});

describe("pilihMic", () => {
  it("loopback & kabel virtual tidak pernah dipilih", () => {
    for (const n of [
      "Stereo Mix (Realtek(R) Audio)", "What U Hear (Sound Blaster)", "CABLE Output (VB-Audio Virtual Cable)",
      "VoiceMeeter Output (VB-Audio VoiceMeeter VAIO)", "Mixage stéréo (Realtek)",
    ]) {
      expect(pilihMic([n]), n).toBeNull();
    }
  });

  it("cuma ada loopback: jawabannya TIDAK ADA - bukan diam-diam merekam speaker", () => {
    expect(pilihMic(["Stereo Mix (Realtek High Definition Audio)"])).toBeNull();
  });

  it("yang namanya jelas mic didahulukan", () => {
    expect(pilihMic(["Line In (Realtek)", "Headset Microphone (Jabra)"])).toBe("Headset Microphone (Jabra)");
  });

  it("tidak ada yang jelas mic: ambil yang pertama selain loopback", () => {
    expect(pilihMic(["Stereo Mix (X)", "USB PnP Sound Device", "Line In"])).toBe("USB PnP Sound Device");
  });

  it("daftar kosong", () => {
    expect(pilihMic([])).toBeNull();
  });
});
