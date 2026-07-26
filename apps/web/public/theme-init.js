/**
 * Anti-FOUC tema (Fase 17a; bawaan dibalik ke TERANG pada Fase 18a).
 *
 * Dimuat SINKRON di <head> sebelum CSS dipakai, supaya pemakai yang memilih
 * tema gelap tidak melihat kilatan putih di setiap muat halaman (sebelum
 * Fase 17a tidak ada penjaga semacam ini sama sekali).
 *
 * Sengaja berkas terpisah, BUKAN skrip inline: CSP aplikasi memakai
 * `script-src 'self'` (dikeraskan pada Fase 10h). Skrip inline akan ditolak
 * peramban dan memunculkan console.error di SETIAP rute — yang berarti
 * menggagalkan 45 asersi sapuan rute di ui-sim sekaligus. Melemahkan CSP jadi
 * `'unsafe-inline'` demi kosmetik jelas bukan pertukaran yang sepadan.
 *
 * Menandai `data-theme-init` agar keberhasilannya bisa diuji — tanpa penanda
 * ini, uji hanya akan mengukur efek React yang berjalan belakangan (dan lolos
 * meski anti-FOUC-nya sendiri tidak pernah jalan).
 */
(function () {
  var el = document.documentElement;
  // Terang-dulu (Fase 18a): tanpa preferensi tersimpan, aplikasi tampil putih.
  // Preferensi pengguna yang sudah tersimpan TETAP dihormati — yang berubah
  // hanya nilai bawaannya, bukan perilaku tombol ganti tema.
  var gelap = false;
  try {
    var t = localStorage.getItem("erpindo-theme");
    if (t) gelap = t === "dark";
  } catch (e) {
    /* mode privat / storage diblokir — pakai bawaan terang */
  }
  el.classList.toggle("dark", gelap);
  el.style.colorScheme = gelap ? "dark" : "light";
  el.dataset.themeInit = gelap ? "dark" : "light";
})();
