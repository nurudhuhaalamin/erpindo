import { describe, expect, it } from "vitest";
import { DUNNING_MILESTONES, GRACE_DAYS, dalamJendela, dalamTenggang, dunningWindow, sisaTenggang } from "../src/lib/dunning";

/**
 * Fase 20a — jadwal pengingat sebelum akun jatuh ke baca-saja.
 *
 * Yang dijaga di sini adalah aritmetika jendelanya, bukan pengiriman email.
 * Alasannya: kalau batas jendela salah, pengingat TIDAK PERNAH terkirim — dan
 * kegagalan itu SENYAP. Tidak ada galat, tidak ada log merah; yang ada hanya
 * pelanggan yang mendadak kehilangan akses tulis tanpa peringatan.
 */

const HARI = 86_400_000;
const NOW = Date.parse("2026-07-27T12:00:00.000Z");
const dalam = (jam: number) => new Date(NOW + jam * 3_600_000).toISOString();

describe("jadwal dunning (Fase 20a)", () => {
  it("dua tonggak: H-7 lalu H-1", () => {
    expect(DUNNING_MILESTONES.map((m) => m.hari)).toEqual([7, 1]);
    expect(DUNNING_MILESTONES.map((m) => m.tag)).toEqual(["h7", "h1"]);
  });

  it("jendela antar-tonggak tidak tumpang-tindih", () => {
    const h7 = dunningWindow(7, NOW);
    const h1 = dunningWindow(1, NOW);
    // Atas H-1 (+1 hari) tidak boleh melewati bawah H-7 (+6 hari).
    expect(Date.parse(h1.atas)).toBeLessThanOrEqual(Date.parse(h7.bawah));
  });

  it("H-1 menangkap yang habis dalam 12 jam, bukan yang masih 3 hari", () => {
    expect(dalamJendela(dalam(12), 1, NOW)).toBe(true);
    expect(dalamJendela(dalam(3 * 24), 1, NOW)).toBe(false);
  });

  it("H-7 menangkap yang habis 6,5 hari lagi, bukan yang 3 hari", () => {
    expect(dalamJendela(dalam(6.5 * 24), 7, NOW)).toBe(true);
    expect(dalamJendela(dalam(3 * 24), 7, NOW)).toBe(false);
  });

  it("yang SUDAH lewat tidak masuk jendela mana pun — itu urusan blok kedaluwarsa", () => {
    const kemarin = new Date(NOW - HARI).toISOString();
    for (const { hari } of DUNNING_MILESTONES) expect(dalamJendela(kemarin, hari, NOW)).toBe(false);
  });

  it("jendela H+3 (hari negatif) menoleh ke BELAKANG dengan aritmetika yang sama", () => {
    // Susulan untuk tenant yang sudah baca-saja: yang jatuh 3,5 hari lalu
    // masuk; yang baru jatuh kemarin belum, dan yang jatuh 10 hari lalu sudah
    // lewat — supaya susulannya sekali, bukan tiap hari.
    const laluJam = (jam: number) => new Date(NOW - jam * 3_600_000).toISOString();
    expect(dalamJendela(laluJam(3.5 * 24), -3, NOW)).toBe(true);
    expect(dalamJendela(laluJam(24), -3, NOW)).toBe(false);
    expect(dalamJendela(laluJam(10 * 24), -3, NOW)).toBe(false);
  });

  it("tenant berumur pendek melewati H-1 walau tak pernah melewati H-7", () => {
    // Trial 3 hari: saat dibuat tak masuk jendela H-7 (benar — percuma
    // memperingatkan 7 hari di muka untuk trial 3 hari), tetapi dua hari
    // kemudian ia melewati H-1 dan tetap diperingatkan.
    const habis = new Date(NOW + 3 * HARI).toISOString();
    expect(dalamJendela(habis, 7, NOW)).toBe(false);
    expect(dalamJendela(habis, 1, NOW + 2 * HARI + 3_600_000)).toBe(true);
  });

  /**
   * Masa tenggang (Fase 20c). Yang dijaga di sini adalah BATAS-nya, karena
   * salah satu hari di sini berarti pelanggan kehilangan akses tulis sehari
   * lebih cepat — dan itu jenis kesalahan yang baru ketahuan dari komplain,
   * bukan dari galat.
   */
  describe("masa tenggang", () => {
    const HARI = 86_400_000;
    const habis = new Date(NOW).toISOString();

    it("tepat pada jatuh tempo sudah masuk tenggang, belum baca-saja", () => {
      expect(dalamTenggang(habis, NOW)).toBe(true);
      expect(sisaTenggang(habis, NOW)).toBe(GRACE_DAYS);
    });

    it("hari terakhir tenggang masih boleh menulis", () => {
      const detikSebelumHabis = NOW + GRACE_DAYS * HARI - 1_000;
      expect(dalamTenggang(habis, detikSebelumHabis)).toBe(true);
    });

    it("tepat setelah tenggang habis, TIDAK lagi dalam tenggang", () => {
      expect(dalamTenggang(habis, NOW + GRACE_DAYS * HARI)).toBe(false);
      expect(sisaTenggang(habis, NOW + GRACE_DAYS * HARI)).toBe(0);
    });

    it("sebelum jatuh tempo belum masuk tenggang", () => {
      expect(dalamTenggang(habis, NOW - HARI)).toBe(false);
    });

    it("susulan H+6 tidak bertabrakan dengan hari transisi H+3", () => {
      // Transisi ke baca-saja terjadi di H+3. Susulan memakai jendela
      // -(GRACE_DAYS + 3) = -6, jadi tidak boleh menangkap H+3.
      const jatuhTempoLalu = (hari: number) => new Date(NOW - hari * HARI).toISOString();
      // Jendela -(3+3) mencakup rentang (H+6, H+7] dihitung mundur, jadi yang
      // masuk adalah jatuh tempo 6,5 hari lalu — BUKAN 5,5. Asersi pertama
      // saya sendiri salah di sini dan uji inilah yang menangkapnya.
      expect(dalamJendela(jatuhTempoLalu(3), -(GRACE_DAYS + 3), NOW)).toBe(false);
      expect(dalamJendela(jatuhTempoLalu(5.5), -(GRACE_DAYS + 3), NOW)).toBe(false);
      expect(dalamJendela(jatuhTempoLalu(6.5), -(GRACE_DAYS + 3), NOW)).toBe(true);
    });
  });
});
