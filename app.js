/**
 * ==========================================
 * APLIKASI PENGELOLA HUTANG - MODE GAME
 * ==========================================
 */

// ==========================================
// STORE & UTILS
// ==========================================
const STORAGE_KEY = 'DEBT_HUNTER_DATA_V1';

function saveData() {
    const data = aplikasiSaya.semuaSumber.map(s => ({
        id: s.id,
        namaSumber: s.namaSumber,
        daftarCicilan: s.daftarCicilan.map(c => ({
            id: c.id,
            bulanKe: c.bulanKe,
            tanggalJatuhTempo: c.tanggalJatuhTempo,
            nominal: c.nominal,
            sudahLunas: c.sudahLunas,
            tanggalDibayar: c.tanggalDibayar || null // New field
        }))
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadData() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;

    const data = JSON.parse(raw);
    aplikasiSaya.semuaSumber = data.map(sData => {
        const s = new SumberHutang(sData.namaSumber);
        s.id = sData.id;
        s.daftarCicilan = sData.daftarCicilan.map(cData => {
            const c = new Cicilan(cData.id, cData.bulanKe, cData.tanggalJatuhTempo, cData.nominal, cData.sudahLunas);
            c.tanggalDibayar = cData.tanggalDibayar ? new Date(cData.tanggalDibayar) : null;
            return c;
        });
        return s;
    });
    return true;
}

// ==========================================
// MODELS
// ==========================================

class Cicilan {
    constructor(id, bulanKe, tanggalJatuhTempo, nominal, sudahLunas) {
        this.id = id;
        this.bulanKe = bulanKe;
        this.tanggalJatuhTempo = new Date(tanggalJatuhTempo);
        this.nominal = nominal;
        this.sudahLunas = sudahLunas;
        this.tanggalDibayar = null; // Track kapan dibayar
    }
}

class SumberHutang {
    constructor(namaSumber) {
        this.id = "source_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5);
        this.namaSumber = namaSumber;
        this.daftarCicilan = [];
        this.isExpanded = false;
    }

    tambahCicilan(bulanKe, tanggalJatuhTempo, nominal, sudahLunas) {
        const id = Date.now() + Math.random().toString(36).substr(2, 9);
        const cicilanBaru = new Cicilan(id, bulanKe, tanggalJatuhTempo, nominal, sudahLunas);
        this.daftarCicilan.push(cicilanBaru);
        this.daftarCicilan.sort((a, b) => a.tanggalJatuhTempo - b.tanggalJatuhTempo);
    }

    getTanggalTerdekat() {
        // Logika baru: Cari yang belum lunas OR yang lunas tapi baru HARI INI (masih bisa di-undo)
        // Tapi untuk sorting urgency, kita tetap hanya lihat yang murni belum lunas.
        const belumLunas = this.daftarCicilan.find(c => !c.sudahLunas);
        if (!belumLunas) return new Date('9999-12-31');
        return belumLunas.tanggalJatuhTempo;
    }

    hitungSisa() {
        return this.daftarCicilan
            .filter(c => !c.sudahLunas)
            .reduce((total, c) => total + c.nominal, 0);
    }

    getProgress() {
        // Hitung total cicilan (all time) VS yang sudah lunas PERMANEN
        // Tapi user ingin lihat progress visual. Mari kita anggap yang "baru bayar hari ini" juga dihitung lunas buat progress circular.
        const total = this.daftarCicilan.length;
        const lunas = this.daftarCicilan.filter(c => c.sudahLunas).length;
        return { lunas, total, persentase: total === 0 ? 100 : (lunas / total) * 100 };
    }
}

class PengelolaHutang {
    constructor() {
        this.semuaSumber = [];
    }

    tambahSumber(sumber) {
        this.semuaSumber.push(sumber);
    }

    getSortedSources() {
        return [...this.semuaSumber].sort((a, b) => {
            const dateA = a.getTanggalTerdekat();
            const dateB = b.getTanggalTerdekat();
            return dateA - dateB;
        });
    }

    hasilkanTotal() {
        let totalHutang = 0;
        let totalCicilan = 0;
        let totalLunas = 0;

        this.semuaSumber.forEach(sumber => {
            totalHutang += sumber.hitungSisa();
            const prog = sumber.getProgress();
            totalCicilan += prog.total;
            totalLunas += prog.lunas;
        });

        return {
            sisaUang: totalHutang,
            persenGlobal: totalCicilan === 0 ? 100 : (totalLunas / totalCicilan) * 100,
            statistik: `${totalLunas} / ${totalCicilan} Lunas`
        };
    }

    // Check Status Cicilan: Apakah harus disembunyikan?
    // Aturan: Sembunyi JIKA (Sudah Lunas) DAN (Tanggal Bayar < Hari Ini)
    shouldHide(cicilan) {
        if (!cicilan.sudahLunas) return false; // Belum lunas -> Tampilkan
        if (!cicilan.tanggalDibayar) return true; // Lunas tapi ga ada tanggal (data lama) -> Sembunyikan (anggap lunas lama)

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const payDate = new Date(cicilan.tanggalDibayar);
        payDate.setHours(0, 0, 0, 0);

        // Return true (hide) if payDate is BEFORE today
        return payDate < today;
    }

    // FEATURE: Tambah Sumber dengan generator cicilan otomatis
    tambahSumberOtomatis(nama, jumlahBulan, startTanggal, nominal) {
        const sumberBaru = new SumberHutang(nama);
        const startDate = new Date(startTanggal);

        for (let i = 1; i <= jumlahBulan; i++) {
            // Clone tanggal agar tidak refer ke object yang sama
            let dueDate = new Date(startDate);
            // Tambah bulan: kalau i=1 jan, i=2 feb, dst.
            // Tapi karena startTanggal adalah bulan pertama, kita loop logicnya:
            // Bulan ke-1 = startTanggal
            // Bulan ke-2 = startTanggal + 1 bulan
            dueDate.setMonth(startDate.getMonth() + (i - 1));

            sumberBaru.tambahCicilan(i, dueDate, nominal, false);
        }

        this.tambahSumber(sumberBaru);
        return sumberBaru;
    }

    // FEATURE: Edit Cicilan (Nominal & Tanggal)
    updateCicilan(sourceId, cicilanId, nominalBaru, tanggalBaru) {
        const sumber = this.semuaSumber.find(s => s.id === sourceId);
        if (!sumber) return;

        const cicilan = sumber.daftarCicilan.find(c => c.id === cicilanId);
        if (cicilan) {
            cicilan.nominal = parseInt(nominalBaru);

            // Update Tanggal
            if (tanggalBaru) {
                cicilan.tanggalJatuhTempo = new Date(tanggalBaru);
                // RE-SORTING PENTING: Karena tanggal berubah, urutan mungkin berubah
                sumber.daftarCicilan.sort((a, b) => a.tanggalJatuhTempo - b.tanggalJatuhTempo);
            }
        }
    }

    // FEATURE: Reset Data (Clear All)
    resetAllData() {
        // Hapus semua data di memory
        this.semuaSumber = [];
        // Simpan array kosong ke localStorage
        // PENTING: Jangan removeItem, tapi setItem '[]' agar loadData() tidak menganggap ini user baru.
        localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
        location.reload();
    }
}

// ==========================================
// INIT DATA
// ==========================================
const aplikasiSaya = new PengelolaHutang();

// Coba load dari localStorage dulu
if (!loadData()) {
    // Kalau kosong (pengguna baru), buat data dummy
    // UPDATE: Start 0% (Semua belum lunas)

    // Musuh 1
    const gopay = new SumberHutang("MUSUH A (Gopay)");
    gopay.tambahCicilan(1, "2026-02-10", 59250, false);
    gopay.tambahCicilan(2, "2026-03-10", 59250, false);

    // Musuh 2
    const dana = new SumberHutang("MUSUH B (Dana)");
    dana.tambahCicilan(1, "2026-02-13", 33605, false);

    // Musuh 3
    const tiktok = new SumberHutang("MUSUH C (TikTok)");
    tiktok.tambahCicilan(1, "2026-03-01", 73605, false);

    aplikasiSaya.tambahSumber(gopay);
    aplikasiSaya.tambahSumber(dana);
    aplikasiSaya.tambahSumber(tiktok);

    saveData(); // Simpan init data
}
